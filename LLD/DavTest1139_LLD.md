# DavTest1139 Online Shopping Platform - Low-Level Design Document

## Table of Contents
1. [Component Specifications](#component-specifications)
2. [Data Flow Diagrams](#data-flow-diagrams)
3. [Sequence Diagrams](#sequence-diagrams)
4. [Implementation Details](#implementation-details)
5. [Database Schema](#database-schema)
6. [API Specifications](#api-specifications)
7. [Security Implementation](#security-implementation)
8. [Performance Optimization](#performance-optimization)
9. [Error Handling](#error-handling)
10. [Testing Strategy](#testing-strategy)

## Component Specifications

### 1. User Service Component

#### Class: UserController
```java
@RestController
@RequestMapping("/api/v1/users")
public class UserController {
    @Autowired
    private UserService userService;
    
    @PostMapping("/register")
    public ResponseEntity<UserResponse> registerUser(@Valid @RequestBody UserRegistrationRequest request) {
        UserResponse response = userService.registerUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
    
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> authenticateUser(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = userService.authenticateUser(request);
        return ResponseEntity.ok(response);
    }
    
    @GetMapping("/{userId}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<UserProfile> getUserProfile(@PathVariable Long userId) {
        UserProfile profile = userService.getUserProfile(userId);
        return ResponseEntity.ok(profile);
    }
}
```

#### Class: UserService
```java
@Service
@Transactional
public class UserService {
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private PasswordEncoder passwordEncoder;
    
    @Autowired
    private JwtTokenProvider tokenProvider;
    
    public UserResponse registerUser(UserRegistrationRequest request) {
        validateUserRegistration(request);
        
        User user = User.builder()
            .email(request.getEmail())
            .passwordHash(passwordEncoder.encode(request.getPassword()))
            .firstName(request.getFirstName())
            .lastName(request.getLastName())
            .phone(request.getPhone())
            .status(UserStatus.ACTIVE)
            .emailVerified(false)
            .createdAt(Instant.now())
            .build();
            
        User savedUser = userRepository.save(user);
        
        // Send verification email
        emailService.sendVerificationEmail(savedUser);
        
        return UserResponse.from(savedUser);
    }
    
    public AuthResponse authenticateUser(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new InvalidCredentialsException("Invalid email or password"));
            
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new InvalidCredentialsException("Invalid email or password");
        }
        
        String token = tokenProvider.generateToken(user);
        
        return AuthResponse.builder()
            .token(token)
            .userId(user.getUserId())
            .email(user.getEmail())
            .roles(user.getRoles())
            .build();
    }
}
```

### 2. Product Service Component

#### Class: ProductController
```java
@RestController
@RequestMapping("/api/v1/products")
public class ProductController {
    @Autowired
    private ProductService productService;
    
    @GetMapping
    public ResponseEntity<PagedResponse<ProductSummary>> getProducts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "createdAt") String sortBy,
            @RequestParam(defaultValue = "desc") String sortDir) {
        
        ProductSearchCriteria criteria = ProductSearchCriteria.builder()
            .category(category)
            .searchTerm(search)
            .page(page)
            .size(size)
            .sortBy(sortBy)
            .sortDirection(sortDir)
            .build();
            
        PagedResponse<ProductSummary> products = productService.searchProducts(criteria);
        return ResponseEntity.ok(products);
    }
    
    @PostMapping
    @PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
    public ResponseEntity<ProductResponse> createProduct(@Valid @RequestBody CreateProductRequest request) {
        ProductResponse response = productService.createProduct(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}
```

#### Class: ProductSearchService
```java
@Service
public class ProductSearchService {
    @Autowired
    private ElasticsearchTemplate elasticsearchTemplate;
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    public PagedResponse<ProductSummary> searchProducts(ProductSearchCriteria criteria) {
        String cacheKey = generateCacheKey(criteria);
        
        // Check Redis cache first
        PagedResponse<ProductSummary> cachedResult = (PagedResponse<ProductSummary>) 
            redisTemplate.opsForValue().get(cacheKey);
            
        if (cachedResult != null) {
            return cachedResult;
        }
        
        // Build Elasticsearch query
        BoolQueryBuilder queryBuilder = QueryBuilders.boolQuery();
        
        if (StringUtils.hasText(criteria.getSearchTerm())) {
            queryBuilder.must(QueryBuilders.multiMatchQuery(criteria.getSearchTerm())
                .field("name", 2.0f)
                .field("description", 1.0f)
                .field("category.name", 1.5f));
        }
        
        if (StringUtils.hasText(criteria.getCategory())) {
            queryBuilder.filter(QueryBuilders.termQuery("category.id", criteria.getCategory()));
        }
        
        // Add price range filter
        if (criteria.getMinPrice() != null || criteria.getMaxPrice() != null) {
            RangeQueryBuilder priceRange = QueryBuilders.rangeQuery("price");
            if (criteria.getMinPrice() != null) {
                priceRange.gte(criteria.getMinPrice());
            }
            if (criteria.getMaxPrice() != null) {
                priceRange.lte(criteria.getMaxPrice());
            }
            queryBuilder.filter(priceRange);
        }
        
        // Execute search
        SearchQuery searchQuery = new NativeSearchQueryBuilder()
            .withQuery(queryBuilder)
            .withPageable(PageRequest.of(criteria.getPage(), criteria.getSize()))
            .withSort(SortBuilders.fieldSort(criteria.getSortBy())
                .order(SortOrder.fromString(criteria.getSortDirection())))
            .build();
            
        SearchHits<ProductDocument> searchHits = elasticsearchTemplate.search(searchQuery, ProductDocument.class);
        
        List<ProductSummary> products = searchHits.getSearchHits().stream()
            .map(hit -> ProductSummary.from(hit.getContent()))
            .collect(Collectors.toList());
            
        PagedResponse<ProductSummary> result = new PagedResponse<>(
            products,
            criteria.getPage(),
            criteria.getSize(),
            searchHits.getTotalHits()
        );
        
        // Cache result for 5 minutes
        redisTemplate.opsForValue().set(cacheKey, result, Duration.ofMinutes(5));
        
        return result;
    }
}
```

### 3. Order Service Component

#### Class: OrderStateMachine
```java
@Component
public class OrderStateMachine {
    private final Map<OrderStatus, Set<OrderStatus>> allowedTransitions;
    
    public OrderStateMachine() {
        allowedTransitions = Map.of(
            OrderStatus.PENDING, Set.of(OrderStatus.CONFIRMED, OrderStatus.CANCELLED),
            OrderStatus.CONFIRMED, Set.of(OrderStatus.PROCESSING, OrderStatus.CANCELLED),
            OrderStatus.PROCESSING, Set.of(OrderStatus.SHIPPED, OrderStatus.CANCELLED),
            OrderStatus.SHIPPED, Set.of(OrderStatus.DELIVERED, OrderStatus.RETURNED),
            OrderStatus.DELIVERED, Set.of(OrderStatus.RETURNED),
            OrderStatus.CANCELLED, Set.of(),
            OrderStatus.RETURNED, Set.of()
        );
    }
    
    public boolean canTransition(OrderStatus from, OrderStatus to) {
        return allowedTransitions.getOrDefault(from, Set.of()).contains(to);
    }
    
    public void validateTransition(OrderStatus from, OrderStatus to) {
        if (!canTransition(from, to)) {
            throw new InvalidOrderTransitionException(
                String.format("Cannot transition from %s to %s", from, to));
        }
    }
}
```

#### Class: OrderSagaOrchestrator
```java
@Component
public class OrderSagaOrchestrator {
    @Autowired
    private PaymentService paymentService;
    
    @Autowired
    private InventoryService inventoryService;
    
    @Autowired
    private NotificationService notificationService;
    
    @SagaOrchestrationStart
    public void processOrder(OrderCreatedEvent event) {
        try {
            // Step 1: Reserve inventory
            ReserveInventoryCommand reserveCmd = new ReserveInventoryCommand(
                event.getOrderId(), event.getOrderItems());
            inventoryService.reserveInventory(reserveCmd);
            
            // Step 2: Process payment
            ProcessPaymentCommand paymentCmd = new ProcessPaymentCommand(
                event.getOrderId(), event.getTotalAmount(), event.getPaymentDetails());
            paymentService.processPayment(paymentCmd);
            
        } catch (Exception e) {
            // Compensate: Release inventory if payment fails
            ReleaseInventoryCommand releaseCmd = new ReleaseInventoryCommand(
                event.getOrderId(), event.getOrderItems());
            inventoryService.releaseInventory(releaseCmd);
            
            // Mark order as failed
            orderService.markOrderAsFailed(event.getOrderId(), e.getMessage());
        }
    }
    
    @SagaOrchestrationEnd
    public void completeOrder(PaymentProcessedEvent event) {
        if (event.isSuccessful()) {
            orderService.confirmOrder(event.getOrderId());
            notificationService.sendOrderConfirmation(event.getOrderId());
        } else {
            // Compensate: Release inventory
            Order order = orderService.getOrder(event.getOrderId());
            ReleaseInventoryCommand releaseCmd = new ReleaseInventoryCommand(
                order.getOrderId(), order.getOrderItems());
            inventoryService.releaseInventory(releaseCmd);
            
            orderService.markOrderAsFailed(event.getOrderId(), event.getFailureReason());
        }
    }
}
```

### 4. Payment Service Component

#### Class: PaymentGatewayFactory
```java
@Component
public class PaymentGatewayFactory {
    @Autowired
    private StripePaymentGateway stripeGateway;
    
    @Autowired
    private PayPalPaymentGateway paypalGateway;
    
    @Autowired
    private SquarePaymentGateway squareGateway;
    
    public PaymentGateway getGateway(PaymentMethod method) {
        switch (method) {
            case CREDIT_CARD:
                return stripeGateway;
            case PAYPAL:
                return paypalGateway;
            case SQUARE:
                return squareGateway;
            default:
                throw new UnsupportedPaymentMethodException("Unsupported payment method: " + method);
        }
    }
}
```

#### Class: FraudDetectionService
```java
@Service
public class FraudDetectionService {
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    public FraudRiskAssessment assessRisk(PaymentRequest request) {
        FraudRiskAssessment assessment = new FraudRiskAssessment();
        
        // Check velocity (number of transactions per hour)
        String velocityKey = "fraud:velocity:" + request.getUserId();
        Long transactionCount = redisTemplate.opsForValue().increment(velocityKey);
        redisTemplate.expire(velocityKey, Duration.ofHours(1));
        
        if (transactionCount > 10) {
            assessment.addRiskFactor("HIGH_VELOCITY", 0.8);
        }
        
        // Check amount patterns
        if (request.getAmount().compareTo(BigDecimal.valueOf(1000)) > 0) {
            assessment.addRiskFactor("HIGH_AMOUNT", 0.6);
        }
        
        // Check geographic patterns
        if (isUnusualLocation(request.getUserId(), request.getIpAddress())) {
            assessment.addRiskFactor("UNUSUAL_LOCATION", 0.7);
        }
        
        // Calculate overall risk score
        double riskScore = assessment.calculateRiskScore();
        assessment.setRiskLevel(determineRiskLevel(riskScore));
        
        return assessment;
    }
    
    private boolean isUnusualLocation(Long userId, String ipAddress) {
        // Implementation for geographic risk assessment
        return false;
    }
    
    private RiskLevel determineRiskLevel(double score) {
        if (score >= 0.8) return RiskLevel.HIGH;
        if (score >= 0.5) return RiskLevel.MEDIUM;
        return RiskLevel.LOW;
    }
}
```

## Data Flow Diagrams

### User Registration Flow
```
Client Request → API Gateway → User Service → Database
                     ↓
            Email Service ← Notification Service
                     ↓
                User Email Inbox
```

### Product Search Flow
```
Client Request → API Gateway → Product Service → Redis Cache
                                      ↓ (cache miss)
                               Elasticsearch → Database
                                      ↓
                               Cache Result → Client Response
```

### Order Processing Flow
```
Client → API Gateway → Order Service → Saga Orchestrator
                            ↓
                    Inventory Service (Reserve)
                            ↓
                    Payment Service (Process)
                            ↓
                    Notification Service (Confirm)
```

## Sequence Diagrams

### User Authentication Sequence
```
Client          API Gateway     Auth Service    Database        Redis
  |                 |               |             |              |
  |-- POST /login --|               |             |              |
  |                 |-- validate ---|             |              |
  |                 |               |-- query ----|              |
  |                 |               |             |-- result ----|              |
  |                 |               |-- verify password         |
  |                 |               |-- generate JWT            |
  |                 |               |-- cache ---|--------------|              |
  |                 |-- JWT token --|             |              |
  |-- 200 OK -------|               |             |              |
```

### Order Checkout Sequence
```
Client      API Gateway   Order Service   Payment Service   Inventory Service
  |             |              |                |                  |
  |-- checkout--|              |                |                  |
  |             |-- create -----|                |                  |
  |             |              |-- reserve -----|------------------|                  |
  |             |              |                |-- process -------|                  |
  |             |              |-- confirm -----|                  |
  |             |-- order ID --|                |                  |
  |-- 201 ------|              |                |                  |
```

## Implementation Details

### Database Schema

#### Users Table
```sql
CREATE TABLE users (
    user_id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
```

#### Products Table
```sql
CREATE TABLE products (
    product_id BIGSERIAL PRIMARY KEY,
    seller_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    category_id BIGINT NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    images JSONB,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES sellers(seller_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_price ON products(price);
```

#### Orders Table
```sql
CREATE TABLE orders (
    order_id BIGSERIAL PRIMARY KEY,
    buyer_id BIGINT NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    payment_status VARCHAR(20) DEFAULT 'PENDING',
    shipping_address JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (buyer_id) REFERENCES users(user_id)
);

CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
```

### API Specifications

#### User Registration API
```yaml
POST /api/v1/users/register
Content-Type: application/json

Request Body:
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"
}

Response (201 Created):
{
  "userId": 12345,
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "status": "ACTIVE",
  "emailVerified": false,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### Product Search API
```yaml
GET /api/v1/products?search=laptop&category=electronics&page=0&size=20

Response (200 OK):
{
  "content": [
    {
      "productId": 1001,
      "name": "Gaming Laptop",
      "description": "High-performance gaming laptop",
      "price": 1299.99,
      "category": "Electronics",
      "images": ["image1.jpg", "image2.jpg"],
      "stockQuantity": 15,
      "seller": {
        "sellerId": 501,
        "businessName": "Tech Store"
      }
    }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 150,
  "totalPages": 8
}
```

### Security Implementation

#### JWT Token Configuration
```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    
    @Bean
    public JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint() {
        return new JwtAuthenticationEntryPoint();
    }
    
    @Bean
    public JwtAuthenticationFilter jwtAuthenticationFilter() {
        return new JwtAuthenticationFilter();
    }
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf().disable()
            .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            .and()
            .authorizeHttpRequests(authz -> authz
                .requestMatchers("/api/v1/auth/**").permitAll()
                .requestMatchers("/api/v1/products").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/products").hasRole("SELLER")
                .requestMatchers("/api/v1/orders/**").authenticated()
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .exceptionHandling().authenticationEntryPoint(jwtAuthenticationEntryPoint())
            .and()
            .addFilterBefore(jwtAuthenticationFilter(), UsernamePasswordAuthenticationFilter.class);
            
        return http.build();
    }
}
```

#### Data Encryption Service
```java
@Service
public class EncryptionService {
    
    @Value("${app.encryption.key}")
    private String encryptionKey;
    
    private final AESUtil aesUtil;
    
    public String encryptPII(String plaintext) {
        try {
            return aesUtil.encrypt(plaintext, encryptionKey);
        } catch (Exception e) {
            throw new EncryptionException("Failed to encrypt PII data", e);
        }
    }
    
    public String decryptPII(String ciphertext) {
        try {
            return aesUtil.decrypt(ciphertext, encryptionKey);
        } catch (Exception e) {
            throw new DecryptionException("Failed to decrypt PII data", e);
        }
    }
}
```

### Performance Optimization

#### Redis Caching Configuration
```java
@Configuration
@EnableCaching
public class CacheConfig {
    
    @Bean
    public RedisConnectionFactory redisConnectionFactory() {
        LettuceConnectionFactory factory = new LettuceConnectionFactory(
            new RedisStandaloneConfiguration("localhost", 6379));
        factory.setValidateConnection(true);
        return factory;
    }
    
    @Bean
    public RedisTemplate<String, Object> redisTemplate() {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(redisConnectionFactory());
        template.setDefaultSerializer(new GenericJackson2JsonRedisSerializer());
        return template;
    }
    
    @Bean
    public CacheManager cacheManager() {
        RedisCacheManager.Builder builder = RedisCacheManager
            .RedisCacheManagerBuilder
            .fromConnectionFactory(redisConnectionFactory())
            .cacheDefaults(cacheConfiguration());
        return builder.build();
    }
    
    private RedisCacheConfiguration cacheConfiguration() {
        return RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(10))
            .serializeKeysWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()));
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
      connection-timeout: 20000
      idle-timeout: 300000
      max-lifetime: 1200000
      leak-detection-threshold: 60000
```

### Error Handling

#### Global Exception Handler
```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(ValidationException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("VALIDATION_ERROR")
            .message(ex.getMessage())
            .timestamp(Instant.now())
            .build();
        return ResponseEntity.badRequest().body(error);
    }
    
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleResourceNotFound(ResourceNotFoundException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("RESOURCE_NOT_FOUND")
            .message(ex.getMessage())
            .timestamp(Instant.now())
            .build();
        return ResponseEntity.notFound().build();
    }
    
    @ExceptionHandler(PaymentProcessingException.class)
    public ResponseEntity<ErrorResponse> handlePaymentError(PaymentProcessingException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("PAYMENT_ERROR")
            .message("Payment processing failed")
            .details(ex.getDetails())
            .timestamp(Instant.now())
            .build();
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(error);
    }
    
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(Exception ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("INTERNAL_ERROR")
            .message("An unexpected error occurred")
            .timestamp(Instant.now())
            .build();
        return ResponseEntity.internalServerError().body(error);
    }
}
```

#### Circuit Breaker Implementation
```java
@Component
public class PaymentServiceCircuitBreaker {
    
    private final CircuitBreaker circuitBreaker;
    
    public PaymentServiceCircuitBreaker() {
        this.circuitBreaker = CircuitBreaker.ofDefaults("paymentService");
        circuitBreaker.getEventPublisher()
            .onStateTransition(event -> 
                log.info("Circuit breaker state transition: {}", event));
    }
    
    public PaymentResult processPayment(PaymentRequest request) {
        Supplier<PaymentResult> decoratedSupplier = CircuitBreaker
            .decorateSupplier(circuitBreaker, () -> {
                return paymentGateway.processPayment(request);
            });
            
        try {
            return decoratedSupplier.get();
        } catch (CallNotPermittedException ex) {
            // Circuit breaker is open
            return PaymentResult.failure("Payment service temporarily unavailable");
        }
    }
}
```

### Testing Strategy

#### Unit Test Example
```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {
    
    @Mock
    private UserRepository userRepository;
    
    @Mock
    private PasswordEncoder passwordEncoder;
    
    @Mock
    private EmailService emailService;
    
    @InjectMocks
    private UserService userService;
    
    @Test
    void registerUser_ValidRequest_ReturnsUserResponse() {
        // Given
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .email("test@example.com")
            .password("password123")
            .firstName("John")
            .lastName("Doe")
            .build();
            
        User savedUser = User.builder()
            .userId(1L)
            .email(request.getEmail())
            .firstName(request.getFirstName())
            .lastName(request.getLastName())
            .build();
            
        when(passwordEncoder.encode(request.getPassword()))
            .thenReturn("encodedPassword");
        when(userRepository.save(any(User.class)))
            .thenReturn(savedUser);
            
        // When
        UserResponse response = userService.registerUser(request);
        
        // Then
        assertThat(response.getUserId()).isEqualTo(1L);
        assertThat(response.getEmail()).isEqualTo("test@example.com");
        verify(emailService).sendVerificationEmail(savedUser);
    }
}
```

#### Integration Test Example
```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(locations = "classpath:application-test.properties")
class OrderControllerIntegrationTest {
    
    @Autowired
    private TestRestTemplate restTemplate;
    
    @Autowired
    private OrderRepository orderRepository;
    
    @Test
    void createOrder_ValidRequest_ReturnsCreatedOrder() {
        // Given
        CreateOrderRequest request = CreateOrderRequest.builder()
            .buyerId(1L)
            .items(List.of(
                OrderItemRequest.builder()
                    .productId(1L)
                    .quantity(2)
                    .build()
            ))
            .shippingAddress(createTestAddress())
            .build();
            
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(getValidJwtToken());
        HttpEntity<CreateOrderRequest> entity = new HttpEntity<>(request, headers);
        
        // When
        ResponseEntity<OrderResponse> response = restTemplate.exchange(
            "/api/v1/orders",
            HttpMethod.POST,
            entity,
            OrderResponse.class
        );
        
        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().getOrderId()).isNotNull();
        
        Optional<Order> savedOrder = orderRepository.findById(response.getBody().getOrderId());
        assertThat(savedOrder).isPresent();
    }
}
```

## Performance Benchmarks

### Expected Performance Metrics
- **User Registration**: < 500ms response time
- **Product Search**: < 200ms response time (cached), < 800ms (uncached)
- **Order Checkout**: < 2 seconds end-to-end
- **Payment Processing**: < 5 seconds including external gateway
- **Concurrent Users**: Support for 100,000+ concurrent users
- **Database Queries**: < 100ms for simple queries, < 500ms for complex joins

### Monitoring and Alerting
```yaml
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
```

## Deployment Configuration

### Docker Configuration
```dockerfile
FROM openjdk:17-jdk-slim

VOLUME /tmp

COPY target/shopping-platform-*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app.jar"]
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shopping-platform
spec:
  replicas: 3
  selector:
    matchLabels:
      app: shopping-platform
  template:
    metadata:
      labels:
        app: shopping-platform
    spec:
      containers:
      - name: shopping-platform
        image: shopping-platform:latest
        ports:
        - containerPort: 8080
        env:
        - name: SPRING_PROFILES_ACTIVE
          value: "production"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
```

This Low-Level Design document provides comprehensive implementation details for the DavTest1139 Online Shopping Platform, covering all architectural components, data flows, security implementations, and performance optimizations required for a production-ready e-commerce system.