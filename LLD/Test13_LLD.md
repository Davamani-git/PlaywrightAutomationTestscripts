# Low-Level Design Document for Test13 Online Shopping Platform

## 1. Introduction

### 1.1 Purpose
This Low-Level Design (LLD) document provides detailed implementation specifications for the Test13 Online Shopping Platform based on the High-Level Design requirements. It includes component specifications, data flows, sequence diagrams, and implementation details for secure, scalable e-commerce functionality.

### 1.2 Scope
This document covers the detailed design of all microservices, database schemas, API specifications, security implementations, and integration patterns required for the online shopping platform.

### 1.3 Architecture Overview
The system follows a microservices architecture with event-driven communication, implementing enterprise-grade security and compliance requirements.

## 2. Component Specifications

### 2.1 User Service Component

#### 2.1.1 Class Diagram
```java
public class UserService {
    private AuthenticationManager authManager;
    private AuthorizationManager authzManager;
    private UserRepository userRepository;
    private PasswordEncoder passwordEncoder;
    private JwtTokenProvider tokenProvider;
    
    public UserRegistrationResponse registerUser(UserRegistrationRequest request)
    public AuthenticationResponse authenticateUser(LoginRequest request)
    public void logoutUser(String token)
    public UserProfile getUserProfile(UUID userId)
    public void updateUserProfile(UUID userId, UserProfileRequest request)
}

public class User {
    private UUID userId;
    private String email;
    private String passwordHash;
    private String firstName;
    private String lastName;
    private String phoneNumber;
    private Address address;
    private UserRole role;
    private boolean isActive;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime lastLoginAt;
}

public enum UserRole {
    CONSUMER, SELLER, ADMIN
}
```

#### 2.1.2 Database Schema
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    role VARCHAR(20) NOT NULL CHECK (role IN ('CONSUMER', 'SELLER', 'ADMIN')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP
);

CREATE TABLE user_addresses (
    address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    address_type VARCHAR(20) NOT NULL,
    street_address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL,
    is_default BOOLEAN DEFAULT false
);

CREATE TABLE user_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);
```

#### 2.1.3 API Endpoints
```yaml
# User Service API Specification
paths:
  /api/v1/users/register:
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
                phoneNumber:
                  type: string
                role:
                  type: string
                  enum: [CONSUMER, SELLER]
      responses:
        '201':
          description: User registered successfully
        '400':
          description: Invalid input data
        '409':
          description: Email already exists

  /api/v1/users/login:
    post:
      summary: Authenticate user
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
      responses:
        '200':
          description: Authentication successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  accessToken:
                    type: string
                  refreshToken:
                    type: string
                  expiresIn:
                    type: integer
        '401':
          description: Invalid credentials
```

### 2.2 Product Service Component

#### 2.2.1 Class Diagram
```java
public class ProductService {
    private ProductRepository productRepository;
    private CategoryRepository categoryRepository;
    private InventoryService inventoryService;
    private SearchService searchService;
    
    public ProductResponse createProduct(CreateProductRequest request)
    public ProductResponse updateProduct(UUID productId, UpdateProductRequest request)
    public void deleteProduct(UUID productId)
    public ProductResponse getProduct(UUID productId)
    public PagedResponse<ProductResponse> searchProducts(ProductSearchRequest request)
}

public class Product {
    private UUID productId;
    private String name;
    private String description;
    private BigDecimal price;
    private UUID sellerId;
    private UUID categoryId;
    private List<String> imageUrls;
    private ProductStatus status;
    private Map<String, String> attributes;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

public class Inventory {
    private UUID inventoryId;
    private UUID productId;
    private Integer availableQuantity;
    private Integer reservedQuantity;
    private Integer reorderLevel;
    private LocalDateTime lastUpdated;
}
```

#### 2.2.2 Database Schema
```sql
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_category_id UUID REFERENCES categories(category_id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    seller_id UUID REFERENCES users(user_id),
    category_id UUID REFERENCES categories(category_id),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'OUT_OF_STOCK')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_images (
    image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(product_id),
    image_url VARCHAR(500) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0
);

CREATE TABLE inventory (
    inventory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(product_id) UNIQUE,
    available_quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER DEFAULT 10,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.3 Order Service Component

#### 2.3.1 Class Diagram
```java
public class OrderService {
    private OrderRepository orderRepository;
    private CartRepository cartRepository;
    private InventoryService inventoryService;
    private PaymentService paymentService;
    private NotificationService notificationService;
    
    public CartResponse addToCart(UUID userId, AddToCartRequest request)
    public CartResponse getCart(UUID userId)
    public OrderResponse createOrder(UUID userId, CreateOrderRequest request)
    public OrderResponse getOrder(UUID orderId)
    public List<OrderResponse> getUserOrders(UUID userId)
}

public class Order {
    private UUID orderId;
    private UUID userId;
    private List<OrderItem> items;
    private BigDecimal totalAmount;
    private BigDecimal taxAmount;
    private BigDecimal shippingAmount;
    private OrderStatus status;
    private Address shippingAddress;
    private Address billingAddress;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

public class OrderItem {
    private UUID orderItemId;
    private UUID productId;
    private Integer quantity;
    private BigDecimal unitPrice;
    private BigDecimal totalPrice;
}

public enum OrderStatus {
    PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED, REFUNDED
}
```

#### 2.3.2 Database Schema
```sql
CREATE TABLE shopping_carts (
    cart_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cart_items (
    cart_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID REFERENCES shopping_carts(cart_id),
    product_id UUID REFERENCES products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    total_amount DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    shipping_amount DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'PENDING',
    shipping_address_id UUID REFERENCES user_addresses(address_id),
    billing_address_id UUID REFERENCES user_addresses(address_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

### 2.4 Payment Service Component

#### 2.4.1 Class Diagram
```java
public class PaymentService {
    private PaymentRepository paymentRepository;
    private PaymentGatewayFactory gatewayFactory;
    private FraudDetectionService fraudService;
    private EncryptionService encryptionService;
    
    public PaymentResponse processPayment(PaymentRequest request)
    public PaymentResponse getPaymentStatus(UUID paymentId)
    public RefundResponse processRefund(RefundRequest request)
}

public class Payment {
    private UUID paymentId;
    private UUID orderId;
    private BigDecimal amount;
    private PaymentMethod method;
    private PaymentStatus status;
    private String gatewayTransactionId;
    private String gatewayResponse;
    private LocalDateTime processedAt;
    private LocalDateTime createdAt;
}

public enum PaymentMethod {
    CREDIT_CARD, DEBIT_CARD, PAYPAL, BANK_TRANSFER
}

public enum PaymentStatus {
    PENDING, PROCESSING, COMPLETED, FAILED, REFUNDED, CANCELLED
}
```

#### 2.4.2 Database Schema
```sql
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id),
    amount DECIMAL(10,2) NOT NULL,
    method VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    gateway_transaction_id VARCHAR(255),
    gateway_response TEXT,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payment_tokens (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    token_hash VARCHAR(255) NOT NULL,
    card_last_four VARCHAR(4),
    card_type VARCHAR(20),
    expires_at DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 3. Data Flow Diagrams

### 3.1 User Registration Flow
```
User → API Gateway → User Service → Database
  ↓
Audit Service → Audit Database
  ↓
Email Service → User (Confirmation Email)
```

### 3.2 Product Search Flow
```
User → API Gateway → Product Service → Elasticsearch
  ↓
Cache Service (Redis) ← Product Service
  ↓
User ← API Gateway ← Product Service
```

### 3.3 Order Processing Flow
```
User → Cart Service → Order Service → Inventory Service
  ↓                      ↓
Payment Service → Payment Gateway
  ↓
Notification Service → User (Email/SMS)
  ↓
Audit Service → Audit Database
```

## 4. Sequence Diagrams

### 4.1 User Authentication Sequence
```
User -> API Gateway: POST /login {email, password}
API Gateway -> User Service: authenticate(credentials)
User Service -> Database: validateUser(email)
Database -> User Service: userRecord
User Service -> User Service: validatePassword()
User Service -> JWT Service: generateTokens()
JWT Service -> User Service: {accessToken, refreshToken}
User Service -> Redis: storeSession(token)
User Service -> API Gateway: authResponse
API Gateway -> User: {tokens, userInfo}
```

### 4.2 Add to Cart Sequence
```
User -> API Gateway: POST /cart/items {productId, quantity}
API Gateway -> Auth Service: validateToken()
Auth Service -> API Gateway: userInfo
API Gateway -> Cart Service: addItem(userId, productId, quantity)
Cart Service -> Product Service: validateProduct(productId)
Product Service -> Cart Service: productInfo
Cart Service -> Inventory Service: checkAvailability(productId, quantity)
Inventory Service -> Cart Service: availabilityStatus
Cart Service -> Database: saveCartItem()
Cart Service -> API Gateway: cartResponse
API Gateway -> User: updatedCart
```

### 4.3 Order Checkout Sequence
```
User -> API Gateway: POST /orders {cartId, shippingAddress, paymentInfo}
API Gateway -> Order Service: createOrder()
Order Service -> Cart Service: getCartItems(cartId)
Cart Service -> Order Service: cartItems
Order Service -> Inventory Service: reserveItems(items)
Inventory Service -> Order Service: reservationConfirmed
Order Service -> Payment Service: processPayment()
Payment Service -> Payment Gateway: chargeCard()
Payment Gateway -> Payment Service: paymentResult
Payment Service -> Order Service: paymentConfirmed
Order Service -> Database: saveOrder()
Order Service -> Notification Service: sendConfirmation()
Order Service -> API Gateway: orderResponse
API Gateway -> User: orderConfirmation
```

## 5. Security Implementation Details

### 5.1 Authentication & Authorization
```java
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    
    @Override
    protected void doFilterInternal(HttpServletRequest request, 
                                  HttpServletResponse response, 
                                  FilterChain filterChain) {
        String token = extractTokenFromHeader(request);
        
        if (token != null && jwtTokenProvider.validateToken(token)) {
            Authentication auth = jwtTokenProvider.getAuthentication(token);
            SecurityContextHolder.getContext().setAuthentication(auth);
        }
        
        filterChain.doFilter(request, response);
    }
}

@PreAuthorize("hasRole('ADMIN') or @userService.isOwner(#userId, authentication.name)")
public UserProfile getUserProfile(@PathVariable UUID userId) {
    return userService.getUserProfile(userId);
}
```

### 5.2 Data Encryption
```java
@Service
public class EncryptionService {
    
    @Value("${app.encryption.key}")
    private String encryptionKey;
    
    public String encryptSensitiveData(String plainText) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            SecretKeySpec keySpec = new SecretKeySpec(
                encryptionKey.getBytes(), "AES");
            cipher.init(Cipher.ENCRYPT_MODE, keySpec);
            
            byte[] encrypted = cipher.doFinal(plainText.getBytes());
            return Base64.getEncoder().encodeToString(encrypted);
        } catch (Exception e) {
            throw new EncryptionException("Failed to encrypt data", e);
        }
    }
}
```

### 5.3 Input Validation
```java
@RestController
@Validated
public class UserController {
    
    @PostMapping("/register")
    public ResponseEntity<UserResponse> registerUser(
            @Valid @RequestBody UserRegistrationRequest request) {
        
        // Additional custom validation
        validateEmailDomain(request.getEmail());
        validatePasswordStrength(request.getPassword());
        
        UserResponse response = userService.registerUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}

public class UserRegistrationRequest {
    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    @Size(max = 255, message = "Email too long")
    private String email;
    
    @NotBlank(message = "Password is required")
    @Size(min = 8, max = 128, message = "Password must be 8-128 characters")
    @Pattern(regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]", 
             message = "Password must contain uppercase, lowercase, digit and special character")
    private String password;
}
```

## 6. Error Handling Implementation

### 6.1 Global Exception Handler
```java
@ControllerAdvice
public class GlobalExceptionHandler {
    
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(
            ValidationException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("VALIDATION_ERROR")
            .message(ex.getMessage())
            .timestamp(LocalDateTime.now())
            .build();
        return ResponseEntity.badRequest().body(error);
    }
    
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleResourceNotFound(
            ResourceNotFoundException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("RESOURCE_NOT_FOUND")
            .message(ex.getMessage())
            .timestamp(LocalDateTime.now())
            .build();
        return ResponseEntity.notFound().build();
    }
}
```

### 6.2 Circuit Breaker Implementation
```java
@Component
public class PaymentGatewayClient {
    
    @CircuitBreaker(name = "payment-gateway", fallbackMethod = "fallbackPayment")
    @Retry(name = "payment-gateway")
    @TimeLimiter(name = "payment-gateway")
    public CompletableFuture<PaymentResponse> processPayment(PaymentRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            // Payment gateway call
            return paymentGateway.charge(request);
        });
    }
    
    public CompletableFuture<PaymentResponse> fallbackPayment(PaymentRequest request, Exception ex) {
        // Fallback logic - queue for later processing
        return CompletableFuture.completedFuture(
            PaymentResponse.builder()
                .status(PaymentStatus.PENDING)
                .message("Payment queued for processing")
                .build());
    }
}
```

## 7. Performance Optimization

### 7.1 Caching Strategy
```java
@Service
public class ProductService {
    
    @Cacheable(value = "products", key = "#productId")
    public ProductResponse getProduct(UUID productId) {
        return productRepository.findById(productId)
            .map(this::mapToResponse)
            .orElseThrow(() -> new ProductNotFoundException(productId));
    }
    
    @CacheEvict(value = "products", key = "#productId")
    public void updateProduct(UUID productId, UpdateProductRequest request) {
        // Update logic
    }
}

@Configuration
@EnableCaching
public class CacheConfig {
    
    @Bean
    public CacheManager cacheManager() {
        RedisCacheManager.Builder builder = RedisCacheManager
            .RedisCacheManagerBuilder
            .fromConnectionFactory(redisConnectionFactory())
            .cacheDefaults(cacheConfiguration());
        return builder.build();
    }
}
```

### 7.2 Database Optimization
```sql
-- Indexes for performance
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- Composite indexes for common queries
CREATE INDEX idx_products_category_status ON products(category_id, status);
CREATE INDEX idx_orders_user_status ON orders(user_id, status);
```

## 8. Monitoring and Logging

### 8.1 Application Metrics
```java
@Component
public class MetricsCollector {
    
    private final MeterRegistry meterRegistry;
    private final Counter orderCounter;
    private final Timer paymentTimer;
    
    public MetricsCollector(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.orderCounter = Counter.builder("orders.created")
            .description("Number of orders created")
            .register(meterRegistry);
        this.paymentTimer = Timer.builder("payment.processing.time")
            .description("Payment processing time")
            .register(meterRegistry);
    }
    
    public void recordOrderCreated() {
        orderCounter.increment();
    }
    
    public void recordPaymentTime(Duration duration) {
        paymentTimer.record(duration);
    }
}
```

### 8.2 Structured Logging
```java
@Component
public class AuditLogger {
    
    private static final Logger logger = LoggerFactory.getLogger(AuditLogger.class);
    
    public void logUserAction(String userId, String action, String resource, String result) {
        MDC.put("userId", userId);
        MDC.put("action", action);
        MDC.put("resource", resource);
        MDC.put("result", result);
        MDC.put("timestamp", Instant.now().toString());
        
        logger.info("User action performed");
        
        MDC.clear();
    }
}
```

## 9. Deployment Configuration

### 9.1 Docker Configuration
```dockerfile
# Dockerfile for User Service
FROM openjdk:17-jre-slim

ARG JAR_FILE=target/*.jar
COPY ${JAR_FILE} app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app.jar"]
```

### 9.2 Kubernetes Deployment
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
        image: user-service:latest
        ports:
        - containerPort: 8080
        env:
        - name: DB_HOST
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: host
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: password
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

## 10. Testing Strategy

### 10.1 Unit Testing
```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {
    
    @Mock
    private UserRepository userRepository;
    
    @Mock
    private PasswordEncoder passwordEncoder;
    
    @InjectMocks
    private UserService userService;
    
    @Test
    void shouldRegisterUserSuccessfully() {
        // Given
        UserRegistrationRequest request = createValidRegistrationRequest();
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(false);
        when(passwordEncoder.encode(request.getPassword())).thenReturn("encodedPassword");
        
        // When
        UserRegistrationResponse response = userService.registerUser(request);
        
        // Then
        assertThat(response.getUserId()).isNotNull();
        assertThat(response.getEmail()).isEqualTo(request.getEmail());
        verify(userRepository).save(any(User.class));
    }
}
```

### 10.2 Integration Testing
```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class UserControllerIntegrationTest {
    
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:13")
            .withDatabaseName("testdb")
            .withUsername("test")
            .withPassword("test");
    
    @Autowired
    private TestRestTemplate restTemplate;
    
    @Test
    void shouldRegisterUserEndToEnd() {
        // Given
        UserRegistrationRequest request = createValidRegistrationRequest();
        
        // When
        ResponseEntity<UserRegistrationResponse> response = restTemplate.postForEntity(
            "/api/v1/users/register", request, UserRegistrationResponse.class);
        
        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().getUserId()).isNotNull();
    }
}
```

## 11. Compliance Implementation

### 11.1 GDPR Compliance
```java
@Service
public class DataPrivacyService {
    
    public void processDataDeletionRequest(UUID userId) {
        // Anonymize user data while preserving business records
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException(userId));
        
        user.setEmail("deleted-" + userId + "@anonymized.com");
        user.setFirstName("[DELETED]");
        user.setLastName("[DELETED]");
        user.setPhoneNumber(null);
        user.setIsActive(false);
        
        userRepository.save(user);
        
        // Log the deletion for audit purposes
        auditLogger.logDataDeletion(userId, "GDPR_REQUEST");
    }
    
    public UserDataExport exportUserData(UUID userId) {
        // Export all user data in machine-readable format
        return UserDataExport.builder()
            .personalData(getUserPersonalData(userId))
            .orderHistory(getOrderHistory(userId))
            .paymentHistory(getPaymentHistory(userId))
            .build();
    }
}
```

### 11.2 PCI DSS Compliance
```java
@Service
public class PaymentTokenService {
    
    public String tokenizePaymentMethod(PaymentMethodRequest request) {
        // Never store actual card numbers
        String token = generateSecureToken();
        
        PaymentToken paymentToken = PaymentToken.builder()
            .tokenHash(hashToken(token))
            .cardLastFour(request.getCardNumber().substring(
                request.getCardNumber().length() - 4))
            .cardType(determineCardType(request.getCardNumber()))
            .expiresAt(request.getExpiryDate())
            .build();
        
        paymentTokenRepository.save(paymentToken);
        
        // Return token, never store raw card data
        return token;
    }
}
```

## 12. Conclusion

This Low-Level Design document provides comprehensive implementation details for the Test13 Online Shopping Platform, ensuring:

- **Security**: Enterprise-grade security with encryption, authentication, and authorization
- **Scalability**: Microservices architecture with horizontal scaling capabilities
- **Performance**: Optimized database queries, caching strategies, and CDN integration
- **Compliance**: GDPR, PCI DSS, and SOC2 compliance implementations
- **Reliability**: Circuit breaker patterns, retry mechanisms, and comprehensive monitoring
- **Maintainability**: Clean architecture, comprehensive testing, and structured logging

The design follows industry best practices and provides a solid foundation for building a secure, scalable, and compliant e-commerce platform.