# Low-Level Design Document - Online Shopping Platform

## **1. System Architecture Deep Dive**

### **1.1 Microservices Component Specifications**

**API Gateway Service**
- **Technology Stack**: Spring Cloud Gateway / Kong
- **Port**: 8080
- **Responsibilities**:
  - Request routing and load balancing
  - Rate limiting (1000 req/min per user)
  - JWT token validation
  - Request/response logging
- **Configuration**:
  ```yaml
  server:
    port: 8080
  spring:
    cloud:
      gateway:
        routes:
          - id: user-service
            uri: lb://user-service
            predicates:
              - Path=/api/users/**
  ```

**User Service**
- **Technology Stack**: Spring Boot 3.0, PostgreSQL
- **Port**: 8081
- **Database Schema**:
  ```sql
  CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role user_role_enum DEFAULT 'CONSUMER',
    status user_status_enum DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```
- **API Endpoints**:
  - POST /api/users/register
  - POST /api/users/login
  - GET /api/users/profile
  - PUT /api/users/profile

**Product Service**
- **Technology Stack**: Spring Boot 3.0, PostgreSQL, Elasticsearch
- **Port**: 8082
- **Database Schema**:
  ```sql
  CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID REFERENCES users(user_id),
    category_id UUID REFERENCES categories(category_id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    status product_status_enum DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```
- **Search Implementation**:
  ```json
  {
    "mappings": {
      "properties": {
        "name": {"type": "text", "analyzer": "standard"},
        "description": {"type": "text", "analyzer": "standard"},
        "price": {"type": "double"},
        "category": {"type": "keyword"},
        "seller_rating": {"type": "float"}
      }
    }
  }
  ```

**Order Service**
- **Technology Stack**: Spring Boot 3.0, PostgreSQL
- **Port**: 8083
- **Database Schema**:
  ```sql
  CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    total_amount DECIMAL(10,2) NOT NULL,
    status order_status_enum DEFAULT 'PENDING',
    shipping_address JSONB,
    billing_address JSONB,
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivery_date TIMESTAMP
  );
  
  CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id),
    product_id UUID REFERENCES products(product_id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL
  );
  ```

**Payment Service**
- **Technology Stack**: Spring Boot 3.0, PostgreSQL, Stripe SDK
- **Port**: 8084
- **PCI DSS Compliance Implementation**:
  ```java
  @Service
  public class PaymentService {
      @Autowired
      private VaultTemplate vaultTemplate;
      
      public PaymentResult processPayment(PaymentRequest request) {
          // Tokenize card data using Stripe
          String token = stripeService.createToken(request.getCardData());
          
          // Store encrypted payment reference
          String encryptedRef = encryptionService.encrypt(token);
          
          // Process payment
          return stripeService.charge(token, request.getAmount());
      }
  }
  ```

### **1.2 Data Flow Diagrams**

**User Registration Flow**
```
Client → API Gateway → User Service → Database
                    ↓
              Email Service ← Notification Service
```

**Product Search Flow**
```
Client → API Gateway → Product Service → Elasticsearch
                    ↓
              Cache (Redis) → Database (PostgreSQL)
```

**Order Processing Flow**
```
Client → API Gateway → Order Service → Inventory Service
                    ↓                      ↓
              Payment Service → External Gateway
                    ↓
              Notification Service → Email/SMS
```

## **2. Sequence Diagrams**

### **2.1 User Authentication Sequence**
```
User → Frontend → API Gateway → User Service → Database
 |         |          |            |            |
 |    Login Request    |            |            |
 |         |--------->|            |            |
 |         |          |  Validate  |            |
 |         |          |----------->|            |
 |         |          |            | Query User |
 |         |          |            |----------->|
 |         |          |            |<-----------|
 |         |          |<-----------|
 |         |<---------|
 |<--------|
JWT Token
```

### **2.2 Order Checkout Sequence**
```
User → Frontend → API Gateway → Order Service → Payment Service → Stripe
 |         |          |             |              |              |
 |   Checkout        |             |              |              |
 |-------->|-------->|------------>|              |              |
 |         |          |             | Process Payment            |
 |         |          |             |------------>|------------->|
 |         |          |             |<------------|<-------------|
 |         |          |<------------|              |              |
 |<--------|<---------|             |              |              |
Order Confirmation   |             |              |              |
```

## **3. Database Design**

### **3.1 Entity Relationship Diagram**
```sql
-- Core Tables with Relationships
Users ||--o{ Orders : places
Users ||--o{ Products : sells
Orders ||--o{ OrderItems : contains
Products ||--o{ OrderItems : included_in
Products ||--o{ Reviews : receives
Users ||--o{ Reviews : writes
Orders ||--o{ Payments : paid_by
```

### **3.2 Indexing Strategy**
```sql
-- Performance Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_created ON products(created_at DESC);
```

## **4. Security Implementation**

### **4.1 Authentication & Authorization**
```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> 
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/products/**").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/seller/**").hasRole("SELLER")
                .anyRequest().authenticated())
            .oauth2ResourceServer(oauth2 -> oauth2.jwt())
            .build();
    }
}
```

### **4.2 Data Encryption**
```java
@Service
public class EncryptionService {
    
    @Value("${app.encryption.key}")
    private String encryptionKey;
    
    public String encrypt(String data) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            SecretKeySpec keySpec = new SecretKeySpec(
                encryptionKey.getBytes(), "AES");
            cipher.init(Cipher.ENCRYPT_MODE, keySpec);
            
            byte[] encrypted = cipher.doFinal(data.getBytes());
            return Base64.getEncoder().encodeToString(encrypted);
        } catch (Exception e) {
            throw new SecurityException("Encryption failed", e);
        }
    }
}
```

## **5. API Specifications**

### **5.1 RESTful API Design**

**User Management APIs**
```yaml
/api/users:
  post:
    summary: Register new user
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            properties:
              email:
                type: string
                format: email
              password:
                type: string
                minLength: 8
              firstName:
                type: string
              lastName:
                type: string
    responses:
      201:
        description: User created successfully
      400:
        description: Invalid input data
      409:
        description: Email already exists
```

**Product APIs**
```yaml
/api/products:
  get:
    summary: Search products
    parameters:
      - name: q
        in: query
        description: Search query
        schema:
          type: string
      - name: category
        in: query
        description: Category filter
        schema:
          type: string
      - name: minPrice
        in: query
        schema:
          type: number
      - name: maxPrice
        in: query
        schema:
          type: number
      - name: page
        in: query
        schema:
          type: integer
          default: 0
      - name: size
        in: query
        schema:
          type: integer
          default: 20
```

## **6. Caching Strategy**

### **6.1 Redis Implementation**
```java
@Service
public class ProductCacheService {
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    @Cacheable(value = "products", key = "#productId")
    public Product getProduct(String productId) {
        return productRepository.findById(productId);
    }
    
    @CacheEvict(value = "products", key = "#product.productId")
    public Product updateProduct(Product product) {
        return productRepository.save(product);
    }
}
```

### **6.2 Cache Configuration**
```yaml
spring:
  redis:
    host: localhost
    port: 6379
    timeout: 2000ms
    jedis:
      pool:
        max-active: 20
        max-idle: 10
        min-idle: 5
  cache:
    type: redis
    redis:
      time-to-live: 600000  # 10 minutes
```

## **7. Message Queue Implementation**

### **7.1 Event-Driven Architecture**
```java
@Component
public class OrderEventPublisher {
    
    @Autowired
    private RabbitTemplate rabbitTemplate;
    
    public void publishOrderCreated(OrderCreatedEvent event) {
        rabbitTemplate.convertAndSend(
            "order.exchange", 
            "order.created", 
            event
        );
    }
}

@RabbitListener(queues = "notification.queue")
public class NotificationEventListener {
    
    public void handleOrderCreated(OrderCreatedEvent event) {
        // Send order confirmation email
        emailService.sendOrderConfirmation(event.getUserEmail(), 
                                         event.getOrderId());
    }
}
```

## **8. Monitoring & Logging**

### **8.1 Application Metrics**
```java
@RestController
public class ProductController {
    
    private final MeterRegistry meterRegistry;
    private final Counter productSearchCounter;
    
    public ProductController(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.productSearchCounter = Counter.builder("product.search.count")
            .description("Number of product searches")
            .register(meterRegistry);
    }
    
    @GetMapping("/api/products/search")
    public ResponseEntity<List<Product>> searchProducts(@RequestParam String query) {
        productSearchCounter.increment();
        Timer.Sample sample = Timer.start(meterRegistry);
        
        try {
            List<Product> products = productService.searchProducts(query);
            return ResponseEntity.ok(products);
        } finally {
            sample.stop(Timer.builder("product.search.duration")
                .description("Product search duration")
                .register(meterRegistry));
        }
    }
}
```

### **8.2 Structured Logging**
```java
@Component
public class AuditLogger {
    
    private static final Logger logger = LoggerFactory.getLogger(AuditLogger.class);
    
    public void logUserAction(String userId, String action, String resource) {
        MDC.put("userId", userId);
        MDC.put("action", action);
        MDC.put("resource", resource);
        MDC.put("timestamp", Instant.now().toString());
        
        logger.info("User action performed: {} on {}", action, resource);
        
        MDC.clear();
    }
}
```

## **9. Error Handling & Resilience**

### **9.1 Circuit Breaker Implementation**
```java
@Component
public class PaymentServiceClient {
    
    @CircuitBreaker(name = "payment-service", fallbackMethod = "fallbackPayment")
    @Retry(name = "payment-service")
    @TimeLimiter(name = "payment-service")
    public CompletableFuture<PaymentResult> processPayment(PaymentRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            return paymentGateway.charge(request);
        });
    }
    
    public CompletableFuture<PaymentResult> fallbackPayment(PaymentRequest request, Exception ex) {
        return CompletableFuture.completedFuture(
            PaymentResult.builder()
                .status("PENDING")
                .message("Payment processing temporarily unavailable")
                .build()
        );
    }
}
```

### **9.2 Global Exception Handler**
```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidation(ValidationException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("VALIDATION_ERROR")
            .message(ex.getMessage())
            .timestamp(Instant.now())
            .build();
        
        return ResponseEntity.badRequest().body(error);
    }
    
    @ExceptionHandler(PaymentException.class)
    public ResponseEntity<ErrorResponse> handlePayment(PaymentException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("PAYMENT_ERROR")
            .message("Payment processing failed")
            .timestamp(Instant.now())
            .build();
        
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(error);
    }
}
```

## **10. Performance Optimization**

### **10.1 Database Query Optimization**
```java
@Repository
public class ProductRepository {
    
    @Query("""
        SELECT p FROM Product p 
        LEFT JOIN FETCH p.category 
        LEFT JOIN FETCH p.reviews 
        WHERE p.status = 'ACTIVE' 
        AND (:category IS NULL OR p.category.name = :category)
        AND (:minPrice IS NULL OR p.price >= :minPrice)
        AND (:maxPrice IS NULL OR p.price <= :maxPrice)
        ORDER BY p.createdAt DESC
        """)
    Page<Product> findProductsWithFilters(
        @Param("category") String category,
        @Param("minPrice") BigDecimal minPrice,
        @Param("maxPrice") BigDecimal maxPrice,
        Pageable pageable
    );
}
```

### **10.2 Connection Pooling**
```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
      idle-timeout: 300000
      max-lifetime: 1200000
      connection-timeout: 20000
      validation-timeout: 5000
      leak-detection-threshold: 60000
```

## **11. Deployment Configuration**

### **11.1 Docker Configuration**
```dockerfile
FROM openjdk:17-jre-slim

WORKDIR /app

COPY target/shopping-platform-*.jar app.jar

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
```

### **11.2 Kubernetes Deployment**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
    spec:
      containers:
      - name: user-service
        image: shopping-platform/user-service:latest
        ports:
        - containerPort: 8081
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /actuator/health
            port: 8081
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /actuator/health
            port: 8081
          initialDelaySeconds: 5
          periodSeconds: 5
```

## **12. Testing Strategy**

### **12.1 Unit Testing**
```java
@ExtendWith(MockitoExtension.class)
class ProductServiceTest {
    
    @Mock
    private ProductRepository productRepository;
    
    @Mock
    private ElasticsearchTemplate elasticsearchTemplate;
    
    @InjectMocks
    private ProductService productService;
    
    @Test
    void shouldCreateProduct() {
        // Given
        Product product = Product.builder()
            .name("Test Product")
            .price(BigDecimal.valueOf(99.99))
            .build();
        
        when(productRepository.save(any(Product.class)))
            .thenReturn(product);
        
        // When
        Product result = productService.createProduct(product);
        
        // Then
        assertThat(result.getName()).isEqualTo("Test Product");
        verify(productRepository).save(product);
    }
}
```

### **12.2 Integration Testing**
```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:testdb",
    "spring.jpa.hibernate.ddl-auto=create-drop"
})
class ProductControllerIntegrationTest {
    
    @Autowired
    private TestRestTemplate restTemplate;
    
    @Test
    void shouldCreateAndRetrieveProduct() {
        // Given
        ProductRequest request = ProductRequest.builder()
            .name("Integration Test Product")
            .price(BigDecimal.valueOf(49.99))
            .build();
        
        // When
        ResponseEntity<Product> createResponse = restTemplate.postForEntity(
            "/api/products", request, Product.class);
        
        // Then
        assertThat(createResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        
        String productId = createResponse.getBody().getProductId();
        ResponseEntity<Product> getResponse = restTemplate.getForEntity(
            "/api/products/" + productId, Product.class);
        
        assertThat(getResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(getResponse.getBody().getName()).isEqualTo("Integration Test Product");
    }
}
```

This comprehensive Low-Level Design document provides detailed implementation specifications, code examples, and architectural patterns for building a secure, scalable online shopping platform that meets all the requirements outlined in the High-Level Design document.