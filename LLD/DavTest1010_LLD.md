# Low-Level Design Document
## Online Shopping Platform - DavTest1010

### Component Specifications

#### 1. User Service Component

**Authentication Module**
- **Class**: `AuthenticationService`
- **Methods**:
  - `registerUser(UserRegistrationRequest): UserResponse`
  - `authenticateUser(LoginRequest): AuthenticationResponse`
  - `validateJWT(token: String): TokenValidationResult`
  - `refreshToken(refreshToken: String): TokenResponse`
  - `enableMFA(userId: UUID, mfaType: MFAType): MFASetupResponse`
  - `verifyMFA(userId: UUID, code: String): MFAVerificationResult`

**Profile Management Module**
- **Class**: `ProfileService`
- **Methods**:
  - `createProfile(userId: UUID, profileData: ProfileRequest): Profile`
  - `updateProfile(userId: UUID, updates: ProfileUpdateRequest): Profile`
  - `getProfile(userId: UUID): Profile`
  - `deleteProfile(userId: UUID): DeletionResult`

**Role-Based Access Control Module**
- **Class**: `RBACService`
- **Methods**:
  - `assignRole(userId: UUID, roleId: UUID): RoleAssignmentResult`
  - `checkPermission(userId: UUID, resource: String, action: String): Boolean`
  - `getUserRoles(userId: UUID): List<Role>`
  - `createRole(roleData: RoleRequest): Role`

#### 2. Product Service Component

**Catalog Management Module**
- **Class**: `ProductCatalogService`
- **Methods**:
  - `createProduct(productData: ProductRequest): Product`
  - `updateProduct(productId: UUID, updates: ProductUpdateRequest): Product`
  - `getProduct(productId: UUID): Product`
  - `deleteProduct(productId: UUID): DeletionResult`
  - `listProducts(filters: ProductFilters, pagination: Pagination): ProductList`

**Search and Filtering Module**
- **Class**: `ProductSearchService`
- **Methods**:
  - `searchProducts(query: String, filters: SearchFilters): SearchResults`
  - `getProductsByCategory(categoryId: UUID, pagination: Pagination): ProductList`
  - `getProductRecommendations(userId: UUID, limit: Integer): List<Product>`
  - `indexProduct(product: Product): IndexingResult`

**Inventory Management Module**
- **Class**: `InventoryService`
- **Methods**:
  - `updateInventory(productId: UUID, quantity: Integer): InventoryUpdate`
  - `checkAvailability(productId: UUID, requestedQuantity: Integer): AvailabilityResult`
  - `reserveInventory(productId: UUID, quantity: Integer): ReservationResult`
  - `releaseReservation(reservationId: UUID): ReleaseResult`

#### 3. Order Service Component

**Shopping Cart Module**
- **Class**: `ShoppingCartService`
- **Methods**:
  - `createCart(userId: UUID): ShoppingCart`
  - `addToCart(cartId: UUID, productId: UUID, quantity: Integer): CartItem`
  - `updateCartItem(cartItemId: UUID, quantity: Integer): CartItem`
  - `removeFromCart(cartItemId: UUID): RemovalResult`
  - `getCart(cartId: UUID): ShoppingCart`
  - `clearCart(cartId: UUID): ClearResult`

**Order Processing Module**
- **Class**: `OrderProcessingService`
- **Methods**:
  - `createOrder(orderData: OrderRequest): Order`
  - `updateOrderStatus(orderId: UUID, status: OrderStatus): Order`
  - `cancelOrder(orderId: UUID, reason: String): CancellationResult`
  - `getOrder(orderId: UUID): Order`
  - `getOrderHistory(userId: UUID, pagination: Pagination): OrderList`

**Order Tracking Module**
- **Class**: `OrderTrackingService`
- **Methods**:
  - `createTracking(orderId: UUID, trackingData: TrackingRequest): OrderTracking`
  - `updateTrackingStatus(trackingId: UUID, status: TrackingStatus): OrderTracking`
  - `getTrackingInfo(orderId: UUID): OrderTracking`
  - `notifyStatusChange(orderId: UUID, newStatus: TrackingStatus): NotificationResult`

#### 4. Payment Service Component

**Payment Gateway Integration Module**
- **Class**: `PaymentGatewayService`
- **Methods**:
  - `processPayment(paymentRequest: PaymentRequest): PaymentResult`
  - `refundPayment(paymentId: UUID, amount: Decimal): RefundResult`
  - `validatePaymentMethod(paymentMethod: PaymentMethod): ValidationResult`
  - `getPaymentStatus(paymentId: UUID): PaymentStatus`

**Payment Method Management Module**
- **Class**: `PaymentMethodService`
- **Methods**:
  - `savePaymentMethod(userId: UUID, paymentMethodData: PaymentMethodRequest): PaymentMethod`
  - `getUserPaymentMethods(userId: UUID): List<PaymentMethod>`
  - `updatePaymentMethod(methodId: UUID, updates: PaymentMethodUpdate): PaymentMethod`
  - `deletePaymentMethod(methodId: UUID): DeletionResult`

#### 5. Notification Service Component

**Multi-Channel Notification Module**
- **Class**: `NotificationService`
- **Methods**:
  - `sendNotification(notification: NotificationRequest): NotificationResult`
  - `sendEmail(emailData: EmailRequest): EmailResult`
  - `sendSMS(smsData: SMSRequest): SMSResult`
  - `sendPushNotification(pushData: PushNotificationRequest): PushResult`
  - `getNotificationHistory(userId: UUID): List<Notification>`

**Template Management Module**
- **Class**: `NotificationTemplateService`
- **Methods**:
  - `createTemplate(templateData: TemplateRequest): NotificationTemplate`
  - `updateTemplate(templateId: UUID, updates: TemplateUpdate): NotificationTemplate`
  - `getTemplate(templateId: UUID): NotificationTemplate`
  - `renderTemplate(templateId: UUID, data: Map<String, Object>): String`

### Data Flow Specifications

#### User Registration Flow
```
1. Client → API Gateway → User Service
2. User Service validates input data
3. User Service creates user record in database
4. User Service triggers profile creation
5. User Service sends registration event to message queue
6. Notification Service processes event and sends confirmation email
7. Audit Service logs registration activity
8. Response returned to client
```

#### Product Search Flow
```
1. Client → API Gateway → Product Service
2. Product Service checks Redis cache for search results
3. If cache miss, query Elasticsearch index
4. Elasticsearch returns matching products
5. Product Service enriches results with inventory data
6. Results cached in Redis for future requests
7. Response returned to client
```

#### Order Processing Flow
```
1. Client → API Gateway → Order Service
2. Order Service validates cart contents
3. Order Service reserves inventory via Inventory Service
4. Order Service creates order record
5. Order Service triggers payment processing
6. Payment Service processes payment via gateway
7. On success, Order Service confirms order
8. Notification Service sends order confirmation
9. Analytics Service records transaction metrics
```

### Sequence Diagrams

#### User Authentication Sequence
```
Client -> API Gateway: POST /auth/login
API Gateway -> User Service: authenticate(credentials)
User Service -> Database: validateUser(email, password)
Database -> User Service: userRecord
User Service -> User Service: generateJWT()
User Service -> Redis: storeSession(token)
User Service -> API Gateway: AuthResponse(token)
API Gateway -> Client: 200 OK + JWT token
```

#### Product Purchase Sequence
```
Client -> API Gateway: POST /orders
API Gateway -> Order Service: createOrder(orderData)
Order Service -> Inventory Service: reserveItems(products)
Inventory Service -> Database: updateInventory()
Inventory Service -> Order Service: reservationConfirmed
Order Service -> Payment Service: processPayment()
Payment Service -> Payment Gateway: chargeCard()
Payment Gateway -> Payment Service: paymentSuccess
Payment Service -> Order Service: paymentConfirmed
Order Service -> Database: saveOrder()
Order Service -> Message Queue: orderCreated event
Notification Service -> Message Queue: consume orderCreated
Notification Service -> Email Provider: sendConfirmation()
Order Service -> API Gateway: OrderResponse
API Gateway -> Client: 201 Created + Order details
```

### Implementation Details

#### Database Schema Design

**Users Table**
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    account_status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_secret VARCHAR(255)
);
```

**Products Table**
```sql
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    inventory_quantity INTEGER DEFAULT 0,
    seller_id UUID REFERENCES users(user_id),
    category_id UUID REFERENCES categories(category_id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Orders Table**
```sql
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id UUID REFERENCES users(user_id),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    payment_id UUID,
    shipping_address JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### API Specifications

**User Authentication API**
```yaml
POST /api/v1/auth/register
Content-Type: application/json

Request:
{
  "email": "user@example.com",
  "password": "securePassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1-555-123-4567"
}

Response (201):
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "status": "ACTIVE",
  "createdAt": "2024-01-01T10:00:00Z"
}
```

**Product Search API**
```yaml
GET /api/v1/products/search?q=laptop&category=electronics&minPrice=500&maxPrice=2000&page=1&limit=20

Response (200):
{
  "products": [
    {
      "productId": "456e7890-e89b-12d3-a456-426614174001",
      "name": "Gaming Laptop",
      "description": "High-performance gaming laptop",
      "price": 1299.99,
      "sku": "LAPTOP-001",
      "inventory": 15,
      "images": ["image1.jpg", "image2.jpg"],
      "rating": 4.5,
      "reviewCount": 128
    }
  ],
  "totalCount": 45,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

**Order Creation API**
```yaml
POST /api/v1/orders
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>

Request:
{
  "items": [
    {
      "productId": "456e7890-e89b-12d3-a456-426614174001",
      "quantity": 1,
      "unitPrice": 1299.99
    }
  ],
  "shippingAddress": {
    "street": "123 Main St",
    "city": "Anytown",
    "state": "CA",
    "zipCode": "12345",
    "country": "USA"
  },
  "paymentMethodId": "789e0123-e89b-12d3-a456-426614174002"
}

Response (201):
{
  "orderId": "012e3456-e89b-12d3-a456-426614174003",
  "orderNumber": "ORD-2024-001",
  "status": "PROCESSING",
  "totalAmount": 1299.99,
  "estimatedDelivery": "2024-01-10T00:00:00Z",
  "createdAt": "2024-01-01T10:00:00Z"
}
```

### Security Implementation

#### JWT Token Structure
```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "roles": ["CONSUMER"],
    "iat": 1640995200,
    "exp": 1640998800,
    "iss": "shopping-platform",
    "aud": "shopping-platform-api"
  }
}
```

#### Password Hashing Implementation
```java
public class PasswordService {
    private static final int BCRYPT_ROUNDS = 12;
    
    public String hashPassword(String plainPassword) {
        return BCrypt.hashpw(plainPassword, BCrypt.gensalt(BCRYPT_ROUNDS));
    }
    
    public boolean verifyPassword(String plainPassword, String hashedPassword) {
        return BCrypt.checkpw(plainPassword, hashedPassword);
    }
}
```

#### Input Validation
```java
public class ValidationService {
    private static final String EMAIL_REGEX = "^[A-Za-z0-9+_.-]+@([A-Za-z0-9.-]+\\.[A-Za-z]{2,})$";
    private static final String PASSWORD_REGEX = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$";
    
    public ValidationResult validateEmail(String email) {
        if (email == null || !email.matches(EMAIL_REGEX)) {
            return ValidationResult.invalid("Invalid email format");
        }
        return ValidationResult.valid();
    }
    
    public ValidationResult validatePassword(String password) {
        if (password == null || !password.matches(PASSWORD_REGEX)) {
            return ValidationResult.invalid("Password must be at least 8 characters with uppercase, lowercase, number, and special character");
        }
        return ValidationResult.valid();
    }
}
```

### Performance Optimizations

#### Caching Strategy
```java
@Service
public class ProductCacheService {
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    private static final int CACHE_TTL = 3600; // 1 hour
    
    public Product getCachedProduct(UUID productId) {
        String key = "product:" + productId.toString();
        return (Product) redisTemplate.opsForValue().get(key);
    }
    
    public void cacheProduct(Product product) {
        String key = "product:" + product.getProductId().toString();
        redisTemplate.opsForValue().set(key, product, CACHE_TTL, TimeUnit.SECONDS);
    }
}
```

#### Database Connection Pooling
```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
      connection-timeout: 30000
      idle-timeout: 600000
      max-lifetime: 1800000
      leak-detection-threshold: 60000
```

#### Elasticsearch Configuration
```yaml
elasticsearch:
  cluster-name: shopping-platform
  nodes:
    - host: elasticsearch-node-1
      port: 9200
    - host: elasticsearch-node-2
      port: 9200
  indices:
    products:
      settings:
        number_of_shards: 3
        number_of_replicas: 1
      mappings:
        properties:
          name:
            type: text
            analyzer: standard
          description:
            type: text
            analyzer: standard
          price:
            type: double
          category:
            type: keyword
```

### Error Handling

#### Global Exception Handler
```java
@ControllerAdvice
public class GlobalExceptionHandler {
    
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(ValidationException ex) {
        ErrorResponse error = new ErrorResponse(
            "VALIDATION_ERROR",
            ex.getMessage(),
            System.currentTimeMillis()
        );
        return ResponseEntity.badRequest().body(error);
    }
    
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleResourceNotFoundException(ResourceNotFoundException ex) {
        ErrorResponse error = new ErrorResponse(
            "RESOURCE_NOT_FOUND",
            ex.getMessage(),
            System.currentTimeMillis()
        );
        return ResponseEntity.notFound().build();
    }
    
    @ExceptionHandler(PaymentProcessingException.class)
    public ResponseEntity<ErrorResponse> handlePaymentException(PaymentProcessingException ex) {
        ErrorResponse error = new ErrorResponse(
            "PAYMENT_ERROR",
            "Payment processing failed. Please try again.",
            System.currentTimeMillis()
        );
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(error);
    }
}
```

#### Circuit Breaker Implementation
```java
@Component
public class PaymentServiceClient {
    
    @CircuitBreaker(name = "payment-service", fallbackMethod = "fallbackPayment")
    @Retry(name = "payment-service")
    @TimeLimiter(name = "payment-service")
    public CompletableFuture<PaymentResult> processPayment(PaymentRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            // Call external payment gateway
            return paymentGateway.processPayment(request);
        });
    }
    
    public CompletableFuture<PaymentResult> fallbackPayment(PaymentRequest request, Exception ex) {
        return CompletableFuture.completedFuture(
            PaymentResult.failed("Payment service temporarily unavailable")
        );
    }
}
```

### Monitoring and Logging

#### Application Metrics
```java
@Component
public class MetricsService {
    private final MeterRegistry meterRegistry;
    private final Counter orderCounter;
    private final Timer paymentTimer;
    
    public MetricsService(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.orderCounter = Counter.builder("orders.created")
            .description("Number of orders created")
            .register(meterRegistry);
        this.paymentTimer = Timer.builder("payment.processing.time")
            .description("Payment processing time")
            .register(meterRegistry);
    }
    
    public void incrementOrderCount() {
        orderCounter.increment();
    }
    
    public Timer.Sample startPaymentTimer() {
        return Timer.start(meterRegistry);
    }
}
```

#### Structured Logging
```java
@Service
public class AuditService {
    private static final Logger logger = LoggerFactory.getLogger(AuditService.class);
    
    public void logUserAction(UUID userId, String action, String entityType, UUID entityId) {
        MDC.put("userId", userId.toString());
        MDC.put("action", action);
        MDC.put("entityType", entityType);
        MDC.put("entityId", entityId.toString());
        
        logger.info("User action performed: {} on {} with ID {}", action, entityType, entityId);
        
        MDC.clear();
    }
}
```

### Testing Strategy

#### Unit Test Example
```java
@ExtendWith(MockitoExtension.class)
class ProductServiceTest {
    
    @Mock
    private ProductRepository productRepository;
    
    @Mock
    private InventoryService inventoryService;
    
    @InjectMocks
    private ProductService productService;
    
    @Test
    void shouldCreateProductSuccessfully() {
        // Given
        ProductRequest request = new ProductRequest("Test Product", "Description", new BigDecimal("99.99"));
        Product savedProduct = new Product(UUID.randomUUID(), "Test Product", "Description", new BigDecimal("99.99"));
        
        when(productRepository.save(any(Product.class))).thenReturn(savedProduct);
        
        // When
        Product result = productService.createProduct(request);
        
        // Then
        assertThat(result.getName()).isEqualTo("Test Product");
        assertThat(result.getPrice()).isEqualTo(new BigDecimal("99.99"));
        verify(productRepository).save(any(Product.class));
    }
}
```

#### Integration Test Example
```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:testdb",
    "spring.jpa.hibernate.ddl-auto=create-drop"
})
class OrderControllerIntegrationTest {
    
    @Autowired
    private TestRestTemplate restTemplate;
    
    @Autowired
    private OrderRepository orderRepository;
    
    @Test
    void shouldCreateOrderSuccessfully() {
        // Given
        OrderRequest request = new OrderRequest();
        request.setItems(List.of(new OrderItemRequest(UUID.randomUUID(), 1, new BigDecimal("99.99"))));
        
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth("valid-jwt-token");
        HttpEntity<OrderRequest> entity = new HttpEntity<>(request, headers);
        
        // When
        ResponseEntity<OrderResponse> response = restTemplate.postForEntity("/api/v1/orders", entity, OrderResponse.class);
        
        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().getOrderId()).isNotNull();
        assertThat(orderRepository.count()).isEqualTo(1);
    }
}
```

### Deployment Configuration

#### Docker Configuration
```dockerfile
FROM openjdk:17-jre-slim

ARG JAR_FILE=target/*.jar
COPY ${JAR_FILE} app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app.jar"]
```

#### Kubernetes Deployment
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
        - containerPort: 8080
        env:
        - name: SPRING_PROFILES_ACTIVE
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
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
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /actuator/health/readiness
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Configuration Management

#### Application Properties
```yaml
spring:
  application:
    name: shopping-platform
  profiles:
    active: ${SPRING_PROFILES_ACTIVE:development}
  
  datasource:
    url: ${DATABASE_URL:jdbc:postgresql://localhost:5432/shopping_platform}
    username: ${DATABASE_USERNAME:postgres}
    password: ${DATABASE_PASSWORD:password}
    driver-class-name: org.postgresql.Driver
  
  jpa:
    hibernate:
      ddl-auto: ${DDL_AUTO:validate}
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
        format_sql: true
    show-sql: ${SHOW_SQL:false}
  
  redis:
    host: ${REDIS_HOST:localhost}
    port: ${REDIS_PORT:6379}
    password: ${REDIS_PASSWORD:}
    timeout: 2000ms
  
  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
    consumer:
      group-id: shopping-platform
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      properties:
        spring.json.trusted.packages: "com.shoppingplatform.events"

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      show-details: always
  metrics:
    export:
      prometheus:
        enabled: true

logging:
  level:
    com.shoppingplatform: ${LOG_LEVEL:INFO}
    org.springframework.security: DEBUG
  pattern:
    console: "%d{yyyy-MM-dd HH:mm:ss} - %msg%n"
    file: "%d{yyyy-MM-dd HH:mm:ss} [%thread] %-5level %logger{36} - %msg%n"

jwt:
  secret: ${JWT_SECRET:mySecretKey}
  expiration: ${JWT_EXPIRATION:86400}
  refresh-expiration: ${JWT_REFRESH_EXPIRATION:604800}

payment:
  stripe:
    api-key: ${STRIPE_API_KEY}
    webhook-secret: ${STRIPE_WEBHOOK_SECRET}
  paypal:
    client-id: ${PAYPAL_CLIENT_ID}
    client-secret: ${PAYPAL_CLIENT_SECRET}
    mode: ${PAYPAL_MODE:sandbox}

notification:
  email:
    provider: sendgrid
    api-key: ${SENDGRID_API_KEY}
    from-email: ${FROM_EMAIL:noreply@shoppingplatform.com}
  sms:
    provider: twilio
    account-sid: ${TWILIO_ACCOUNT_SID}
    auth-token: ${TWILIO_AUTH_TOKEN}
    from-number: ${TWILIO_FROM_NUMBER}
```

This comprehensive Low-Level Design document provides detailed implementation specifications for the Online Shopping Platform DavTest1010, covering all major components, data flows, security implementations, and deployment configurations necessary for development and deployment.