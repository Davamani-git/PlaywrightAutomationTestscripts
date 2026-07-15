# Low-Level Design Document

## 1. Component Specifications

### 1.1 User Service Component

#### Class: UserController
```java
@RestController
@RequestMapping("/api/v1/users")
@Validated
public class UserController {
    
    @Autowired
    private UserService userService;
    
    @PostMapping("/register")
    public ResponseEntity<UserResponse> registerUser(
        @Valid @RequestBody UserRegistrationRequest request) {
        UserResponse response = userService.registerUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
    
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
        @Valid @RequestBody LoginRequest request) {
        AuthResponse response = userService.authenticateUser(request);
        return ResponseEntity.ok(response);
    }
    
    @GetMapping("/{userId}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<UserProfileResponse> getUserProfile(
        @PathVariable UUID userId) {
        UserProfileResponse response = userService.getUserProfile(userId);
        return ResponseEntity.ok(response);
    }
    
    @PutMapping("/{userId}")
    @PreAuthorize("#userId == authentication.principal.userId or hasRole('ADMIN')")
    public ResponseEntity<UserResponse> updateUser(
        @PathVariable UUID userId,
        @Valid @RequestBody UserUpdateRequest request) {
        UserResponse response = userService.updateUser(userId, request);
        return ResponseEntity.ok(response);
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
    private JwtTokenProvider jwtTokenProvider;
    
    @Autowired
    private NotificationService notificationService;
    
    public UserResponse registerUser(UserRegistrationRequest request) {
        validateUserRegistration(request);
        
        User user = User.builder()
            .userId(UUID.randomUUID())
            .email(request.getEmail())
            .password(passwordEncoder.encode(request.getPassword()))
            .firstName(request.getFirstName())
            .lastName(request.getLastName())
            .phone(request.getPhone())
            .address(request.getAddress())
            .role(UserRole.CONSUMER)
            .isActive(true)
            .createdAt(LocalDateTime.now())
            .build();
            
        User savedUser = userRepository.save(user);
        
        // Send welcome notification
        notificationService.sendWelcomeNotification(savedUser);
        
        return UserMapper.toResponse(savedUser);
    }
    
    public AuthResponse authenticateUser(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new AuthenticationException("Invalid credentials"));
            
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new AuthenticationException("Invalid credentials");
        }
        
        if (!user.getIsActive()) {
            throw new AccountLockedException("Account is locked");
        }
        
        String accessToken = jwtTokenProvider.generateAccessToken(user);
        String refreshToken = jwtTokenProvider.generateRefreshToken(user);
        
        return AuthResponse.builder()
            .accessToken(accessToken)
            .refreshToken(refreshToken)
            .expiresIn(jwtTokenProvider.getAccessTokenExpiration())
            .tokenType("Bearer")
            .build();
    }
    
    private void validateUserRegistration(UserRegistrationRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new UserAlreadyExistsException("Email already registered");
        }
        
        if (!isValidPassword(request.getPassword())) {
            throw new InvalidPasswordException("Password does not meet requirements");
        }
    }
}
```

#### Entity: User
```java
@Entity
@Table(name = "users")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class User {
    
    @Id
    @Column(name = "user_id")
    private UUID userId;
    
    @Column(name = "email", unique = true, nullable = false)
    @Email
    private String email;
    
    @Column(name = "password", nullable = false)
    private String password;
    
    @Column(name = "first_name", nullable = false)
    @Size(min = 1, max = 50)
    private String firstName;
    
    @Column(name = "last_name", nullable = false)
    @Size(min = 1, max = 50)
    private String lastName;
    
    @Column(name = "phone")
    @Pattern(regexp = "^\\+?[1-9]\\d{1,14}$")
    private String phone;
    
    @Column(name = "address")
    @Size(max = 500)
    private String address;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false)
    private UserRole role;
    
    @Column(name = "is_active", nullable = false)
    private Boolean isActive;
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
```

### 1.2 Product Service Component

#### Class: ProductController
```java
@RestController
@RequestMapping("/api/v1/products")
@Validated
public class ProductController {
    
    @Autowired
    private ProductService productService;
    
    @GetMapping
    public ResponseEntity<PagedResponse<ProductResponse>> getProducts(
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
            
        PagedResponse<ProductResponse> response = productService.searchProducts(criteria);
        return ResponseEntity.ok(response);
    }
    
    @PostMapping
    @PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
    public ResponseEntity<ProductResponse> createProduct(
        @Valid @RequestBody ProductCreateRequest request) {
        ProductResponse response = productService.createProduct(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
    
    @GetMapping("/{productId}")
    public ResponseEntity<ProductDetailResponse> getProduct(
        @PathVariable UUID productId) {
        ProductDetailResponse response = productService.getProductDetail(productId);
        return ResponseEntity.ok(response);
    }
}
```

#### Class: ProductService
```java
@Service
@Transactional
public class ProductService {
    
    @Autowired
    private ProductRepository productRepository;
    
    @Autowired
    private ElasticsearchTemplate elasticsearchTemplate;
    
    @Autowired
    private InventoryService inventoryService;
    
    @Autowired
    private ImageUploadService imageUploadService;
    
    public PagedResponse<ProductResponse> searchProducts(ProductSearchCriteria criteria) {
        BoolQueryBuilder queryBuilder = QueryBuilders.boolQuery();
        
        if (StringUtils.hasText(criteria.getSearchTerm())) {
            queryBuilder.must(QueryBuilders.multiMatchQuery(
                criteria.getSearchTerm(), "name", "description", "category"));
        }
        
        if (StringUtils.hasText(criteria.getCategory())) {
            queryBuilder.filter(QueryBuilders.termQuery("category", criteria.getCategory()));
        }
        
        queryBuilder.filter(QueryBuilders.termQuery("isActive", true));
        
        NativeSearchQuery searchQuery = new NativeSearchQueryBuilder()
            .withQuery(queryBuilder)
            .withPageable(PageRequest.of(criteria.getPage(), criteria.getSize()))
            .withSort(SortBuilders.fieldSort(criteria.getSortBy())
                .order(SortOrder.fromString(criteria.getSortDirection())))
            .build();
            
        SearchHits<ProductDocument> searchHits = elasticsearchTemplate.search(searchQuery, ProductDocument.class);
        
        List<ProductResponse> products = searchHits.getSearchHits().stream()
            .map(hit -> ProductMapper.toResponse(hit.getContent()))
            .collect(Collectors.toList());
            
        return PagedResponse.<ProductResponse>builder()
            .content(products)
            .page(criteria.getPage())
            .size(criteria.getSize())
            .totalElements(searchHits.getTotalHits())
            .totalPages((int) Math.ceil((double) searchHits.getTotalHits() / criteria.getSize()))
            .build();
    }
    
    public ProductResponse createProduct(ProductCreateRequest request) {
        validateProductCreation(request);
        
        List<String> imageUrls = imageUploadService.uploadImages(request.getImages());
        
        Product product = Product.builder()
            .productId(UUID.randomUUID())
            .name(request.getName())
            .description(request.getDescription())
            .price(request.getPrice())
            .category(request.getCategory())
            .imageUrls(imageUrls)
            .sellerId(request.getSellerId())
            .isActive(true)
            .createdAt(LocalDateTime.now())
            .build();
            
        Product savedProduct = productRepository.save(product);
        
        // Initialize inventory
        inventoryService.createInventory(savedProduct.getProductId(), request.getInitialStock());
        
        // Index in Elasticsearch
        indexProductInElasticsearch(savedProduct);
        
        return ProductMapper.toResponse(savedProduct);
    }
}
```

### 1.3 Order Service Component

#### Class: OrderController
```java
@RestController
@RequestMapping("/api/v1/orders")
@Validated
public class OrderController {
    
    @Autowired
    private OrderService orderService;
    
    @PostMapping
    @PreAuthorize("hasRole('CONSUMER')")
    public ResponseEntity<OrderResponse> createOrder(
        @Valid @RequestBody OrderCreateRequest request,
        Authentication authentication) {
        UUID userId = ((UserPrincipal) authentication.getPrincipal()).getUserId();
        OrderResponse response = orderService.createOrder(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
    
    @GetMapping("/{orderId}")
    @PreAuthorize("@orderService.isOrderOwner(#orderId, authentication.principal.userId) or hasRole('ADMIN')")
    public ResponseEntity<OrderDetailResponse> getOrder(
        @PathVariable UUID orderId) {
        OrderDetailResponse response = orderService.getOrderDetail(orderId);
        return ResponseEntity.ok(response);
    }
    
    @PutMapping("/{orderId}/cancel")
    @PreAuthorize("@orderService.isOrderOwner(#orderId, authentication.principal.userId)")
    public ResponseEntity<OrderResponse> cancelOrder(
        @PathVariable UUID orderId,
        @Valid @RequestBody OrderCancelRequest request) {
        OrderResponse response = orderService.cancelOrder(orderId, request);
        return ResponseEntity.ok(response);
    }
}
```

#### Class: OrderService
```java
@Service
@Transactional
public class OrderService {
    
    @Autowired
    private OrderRepository orderRepository;
    
    @Autowired
    private CartService cartService;
    
    @Autowired
    private PaymentService paymentService;
    
    @Autowired
    private InventoryService inventoryService;
    
    @Autowired
    private NotificationService notificationService;
    
    public OrderResponse createOrder(UUID userId, OrderCreateRequest request) {
        // Validate cart items
        List<CartItem> cartItems = cartService.getCartItems(userId);
        if (cartItems.isEmpty()) {
            throw new EmptyCartException("Cart is empty");
        }
        
        // Check inventory availability
        validateInventoryAvailability(cartItems);
        
        // Calculate total amount
        BigDecimal totalAmount = calculateTotalAmount(cartItems);
        
        // Create order
        Order order = Order.builder()
            .orderId(UUID.randomUUID())
            .userId(userId)
            .orderDate(LocalDate.now())
            .totalAmount(totalAmount)
            .status(OrderStatus.PENDING)
            .shippingAddress(request.getShippingAddress())
            .paymentMethod(request.getPaymentMethod())
            .createdAt(LocalDateTime.now())
            .build();
            
        Order savedOrder = orderRepository.save(order);
        
        // Create order items
        List<OrderItem> orderItems = createOrderItems(savedOrder.getOrderId(), cartItems);
        
        // Reserve inventory
        reserveInventory(orderItems);
        
        // Process payment
        PaymentResult paymentResult = paymentService.processPayment(
            PaymentRequest.builder()
                .orderId(savedOrder.getOrderId())
                .amount(totalAmount)
                .paymentMethod(request.getPaymentMethod())
                .paymentDetails(request.getPaymentDetails())
                .build());
                
        if (paymentResult.isSuccessful()) {
            savedOrder.setStatus(OrderStatus.CONFIRMED);
            savedOrder.setTrackingNumber(generateTrackingNumber());
            orderRepository.save(savedOrder);
            
            // Clear cart
            cartService.clearCart(userId);
            
            // Send confirmation notification
            notificationService.sendOrderConfirmation(savedOrder);
        } else {
            // Release reserved inventory
            releaseInventory(orderItems);
            throw new PaymentProcessingException("Payment failed: " + paymentResult.getErrorMessage());
        }
        
        return OrderMapper.toResponse(savedOrder);
    }
    
    public OrderResponse cancelOrder(UUID orderId, OrderCancelRequest request) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException("Order not found"));
            
        if (!canCancelOrder(order)) {
            throw new OrderCancellationException("Order cannot be cancelled in current status");
        }
        
        order.setStatus(OrderStatus.CANCELLED);
        order.setUpdatedAt(LocalDateTime.now());
        
        Order savedOrder = orderRepository.save(order);
        
        // Process refund
        paymentService.processRefund(order.getOrderId(), order.getTotalAmount());
        
        // Release inventory
        List<OrderItem> orderItems = getOrderItems(orderId);
        releaseInventory(orderItems);
        
        // Send cancellation notification
        notificationService.sendOrderCancellation(savedOrder, request.getReason());
        
        return OrderMapper.toResponse(savedOrder);
    }
}
```

## 2. Data Flow Diagrams

### 2.1 User Registration Flow
```
sequenceDiagram
    participant U as User
    participant AG as API Gateway
    participant US as User Service
    participant DB as Database
    participant NS as Notification Service
    participant ES as Email Service
    
    U->>AG: POST /api/v1/users/register
    AG->>AG: Rate limiting & validation
    AG->>US: Forward request
    US->>US: Validate input data
    US->>DB: Check email uniqueness
    DB-->>US: Email available
    US->>US: Hash password
    US->>DB: Save user
    DB-->>US: User created
    US->>NS: Send welcome notification
    NS->>ES: Send welcome email
    ES-->>NS: Email sent
    NS-->>US: Notification sent
    US-->>AG: User response
    AG-->>U: 201 Created
```

### 2.2 Product Search Flow
```
sequenceDiagram
    participant U as User
    participant AG as API Gateway
    participant PS as Product Service
    participant ES as Elasticsearch
    participant C as Cache
    participant DB as Database
    
    U->>AG: GET /api/v1/products?search=laptop
    AG->>PS: Forward request
    PS->>C: Check cache
    C-->>PS: Cache miss
    PS->>ES: Search query
    ES-->>PS: Search results
    PS->>DB: Get additional product details
    DB-->>PS: Product details
    PS->>C: Cache results
    PS-->>AG: Product list
    AG-->>U: 200 OK with products
```

### 2.3 Order Processing Flow
```
sequenceDiagram
    participant U as User
    participant AG as API Gateway
    participant OS as Order Service
    participant CS as Cart Service
    participant IS as Inventory Service
    participant PS as Payment Service
    participant PG as Payment Gateway
    participant NS as Notification Service
    participant DB as Database
    
    U->>AG: POST /api/v1/orders
    AG->>OS: Create order request
    OS->>CS: Get cart items
    CS-->>OS: Cart items
    OS->>IS: Check inventory
    IS-->>OS: Inventory available
    OS->>DB: Create order
    DB-->>OS: Order created
    OS->>IS: Reserve inventory
    IS-->>OS: Inventory reserved
    OS->>PS: Process payment
    PS->>PG: Payment request
    PG-->>PS: Payment successful
    PS-->>OS: Payment confirmed
    OS->>DB: Update order status
    OS->>CS: Clear cart
    OS->>NS: Send confirmation
    NS-->>OS: Notification sent
    OS-->>AG: Order response
    AG-->>U: 201 Created
```

## 3. Sequence Diagrams

### 3.1 Authentication Sequence
```
sequenceDiagram
    participant C as Client
    participant AG as API Gateway
    participant AS as Auth Service
    participant JWT as JWT Provider
    participant DB as User Database
    participant R as Redis Cache
    
    C->>AG: POST /auth/login {email, password}
    AG->>AS: Authenticate user
    AS->>DB: Find user by email
    DB-->>AS: User data
    AS->>AS: Verify password
    AS->>JWT: Generate tokens
    JWT-->>AS: Access & refresh tokens
    AS->>R: Store refresh token
    AS-->>AG: Auth response
    AG-->>C: 200 OK {tokens}
    
    Note over C,R: Subsequent API calls
    C->>AG: GET /api/resource (with token)
    AG->>AG: Validate JWT token
    AG->>AS: Verify token signature
    AS-->>AG: Token valid
    AG->>AG: Extract user context
    AG-->>C: Resource data
```

### 3.2 Payment Processing Sequence
```
sequenceDiagram
    participant OS as Order Service
    participant PS as Payment Service
    participant FD as Fraud Detection
    participant PG as Payment Gateway
    participant V as Vault Service
    participant DB as Payment DB
    participant NS as Notification Service
    
    OS->>PS: Process payment request
    PS->>FD: Fraud check
    FD-->>PS: Risk assessment
    alt Low Risk
        PS->>V: Tokenize payment data
        V-->>PS: Payment token
        PS->>PG: Process payment
        PG-->>PS: Payment result
        PS->>DB: Store transaction
        PS->>NS: Send receipt
        PS-->>OS: Payment successful
    else High Risk
        PS->>NS: Send fraud alert
        PS-->>OS: Payment declined
    end
```

## 4. Implementation Details

### 4.1 Database Schema

#### Users Table
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    role VARCHAR(20) NOT NULL CHECK (role IN ('CONSUMER', 'SELLER', 'ADMIN')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at);
```

#### Products Table
```sql
CREATE TABLE products (
    product_id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    category VARCHAR(100) NOT NULL,
    image_urls JSONB,
    seller_id UUID NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES users(user_id)
);

CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_created_at ON products(created_at);
CREATE INDEX idx_products_name_gin ON products USING gin(to_tsvector('english', name));
```

#### Orders Table
```sql
CREATE TABLE orders (
    order_id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    order_date DATE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
    shipping_address TEXT NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    tracking_number VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_orders_tracking ON orders(tracking_number);
```

### 4.2 API Specifications

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
  "phone": "+1234567890",
  "address": "123 Main St, City, State 12345"
}

Response (201 Created):
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "CONSUMER",
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00Z"
}

Error Responses:
400 Bad Request - Validation errors
409 Conflict - Email already exists
500 Internal Server Error - Server error
```

#### Product Search API
```yaml
GET /api/v1/products?search=laptop&category=electronics&page=0&size=20

Response (200 OK):
{
  "content": [
    {
      "productId": "456e7890-e89b-12d3-a456-426614174001",
      "name": "Gaming Laptop",
      "description": "High-performance gaming laptop",
      "price": 1299.99,
      "category": "electronics",
      "imageUrls": ["https://cdn.example.com/laptop1.jpg"],
      "sellerId": "789e0123-e89b-12d3-a456-426614174002",
      "averageRating": 4.5,
      "reviewCount": 128
    }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1
}
```

### 4.3 Security Implementation

#### JWT Token Configuration
```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    
    @Bean
    public JwtTokenProvider jwtTokenProvider() {
        return JwtTokenProvider.builder()
            .secretKey(getSecretKey())
            .accessTokenExpiration(Duration.ofMinutes(15))
            .refreshTokenExpiration(Duration.ofDays(7))
            .algorithm(Algorithm.RS256)
            .build();
    }
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf().disable()
            .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/products/**").permitAll()
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer().jwt()
            .and()
            .addFilterBefore(new JwtAuthenticationFilter(jwtTokenProvider()), 
                UsernamePasswordAuthenticationFilter.class)
            .build();
    }
}
```

#### Input Validation
```java
@Component
public class InputValidator {
    
    private static final Pattern EMAIL_PATTERN = 
        Pattern.compile("^[A-Za-z0-9+_.-]+@([A-Za-z0-9.-]+\\.[A-Za-z]{2,})$");
    
    private static final Pattern PASSWORD_PATTERN = 
        Pattern.compile("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$");
    
    public void validateEmail(String email) {
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            throw new ValidationException("Invalid email format");
        }
    }
    
    public void validatePassword(String password) {
        if (!PASSWORD_PATTERN.matcher(password).matches()) {
            throw new ValidationException(
                "Password must be at least 8 characters with uppercase, lowercase, digit, and special character");
        }
    }
    
    public void sanitizeInput(String input) {
        if (input.contains("<script>") || input.contains("javascript:")) {
            throw new SecurityException("Potentially malicious input detected");
        }
    }
}
```

### 4.4 Error Handling

#### Global Exception Handler
```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    
    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(ValidationException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("VALIDATION_ERROR")
            .message(ex.getMessage())
            .timestamp(Instant.now())
            .build();
        return ResponseEntity.badRequest().body(error);
    }
    
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ErrorResponse> handleAuthenticationException(AuthenticationException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("AUTHENTICATION_FAILED")
            .message("Invalid credentials")
            .timestamp(Instant.now())
            .build();
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(error);
    }
    
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDeniedException(AccessDeniedException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("ACCESS_DENIED")
            .message("Insufficient permissions")
            .timestamp(Instant.now())
            .build();
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error);
    }
    
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(Exception ex) {
        logger.error("Unexpected error occurred", ex);
        ErrorResponse error = ErrorResponse.builder()
            .code("INTERNAL_ERROR")
            .message("An unexpected error occurred")
            .timestamp(Instant.now())
            .build();
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }
}
```

### 4.5 Monitoring and Logging

#### Application Metrics
```java
@Component
public class MetricsCollector {
    
    private final MeterRegistry meterRegistry;
    private final Counter userRegistrationCounter;
    private final Counter orderCreationCounter;
    private final Timer paymentProcessingTimer;
    
    public MetricsCollector(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.userRegistrationCounter = Counter.builder("user.registrations")
            .description("Number of user registrations")
            .register(meterRegistry);
        this.orderCreationCounter = Counter.builder("order.creations")
            .description("Number of orders created")
            .register(meterRegistry);
        this.paymentProcessingTimer = Timer.builder("payment.processing.time")
            .description("Payment processing duration")
            .register(meterRegistry);
    }
    
    public void incrementUserRegistration() {
        userRegistrationCounter.increment();
    }
    
    public void incrementOrderCreation() {
        orderCreationCounter.increment();
    }
    
    public Timer.Sample startPaymentTimer() {
        return Timer.start(meterRegistry);
    }
}
```

#### Audit Logging
```java
@Component
public class AuditLogger {
    
    private static final Logger auditLog = LoggerFactory.getLogger("AUDIT");
    
    public void logUserAction(UUID userId, String action, String entityType, UUID entityId) {
        AuditEvent event = AuditEvent.builder()
            .userId(userId)
            .action(action)
            .entityType(entityType)
            .entityId(entityId)
            .timestamp(Instant.now())
            .ipAddress(getCurrentUserIpAddress())
            .userAgent(getCurrentUserAgent())
            .build();
            
        auditLog.info("AUDIT: {}", objectMapper.writeValueAsString(event));
    }
    
    public void logSecurityEvent(String eventType, String details) {
        SecurityEvent event = SecurityEvent.builder()
            .eventType(eventType)
            .details(details)
            .timestamp(Instant.now())
            .ipAddress(getCurrentUserIpAddress())
            .build();
            
        auditLog.warn("SECURITY: {}", objectMapper.writeValueAsString(event));
    }
}
```

## 5. Configuration and Deployment

### 5.1 Application Configuration
```yaml
# application.yml
spring:
  application:
    name: ecommerce-platform
  
  datasource:
    url: jdbc:postgresql://localhost:5432/ecommerce
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
    driver-class-name: org.postgresql.Driver
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
      connection-timeout: 30000
      idle-timeout: 600000
      max-lifetime: 1800000
  
  jpa:
    hibernate:
      ddl-auto: validate
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
        format_sql: true
    show-sql: false
  
  redis:
    host: ${REDIS_HOST:localhost}
    port: ${REDIS_PORT:6379}
    password: ${REDIS_PASSWORD:}
    timeout: 2000ms
    lettuce:
      pool:
        max-active: 8
        max-idle: 8
        min-idle: 0
  
  elasticsearch:
    uris: ${ELASTICSEARCH_URIS:http://localhost:9200}
    username: ${ELASTICSEARCH_USERNAME:}
    password: ${ELASTICSEARCH_PASSWORD:}
  
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: ${JWT_ISSUER_URI}
          jwk-set-uri: ${JWT_JWK_SET_URI}

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
    com.ecommerce: INFO
    org.springframework.security: DEBUG
  pattern:
    console: "%d{yyyy-MM-dd HH:mm:ss} - %msg%n"
    file: "%d{yyyy-MM-dd HH:mm:ss} [%thread] %-5level %logger{36} - %msg%n"
  file:
    name: logs/application.log
    max-size: 10MB
    max-history: 30

app:
  jwt:
    secret: ${JWT_SECRET}
    access-token-expiration: 900000  # 15 minutes
    refresh-token-expiration: 604800000  # 7 days
  
  payment:
    stripe:
      api-key: ${STRIPE_API_KEY}
      webhook-secret: ${STRIPE_WEBHOOK_SECRET}
    paypal:
      client-id: ${PAYPAL_CLIENT_ID}
      client-secret: ${PAYPAL_CLIENT_SECRET}
  
  notification:
    email:
      provider: sendgrid
      api-key: ${SENDGRID_API_KEY}
    sms:
      provider: twilio
      account-sid: ${TWILIO_ACCOUNT_SID}
      auth-token: ${TWILIO_AUTH_TOKEN}
```

### 5.2 Docker Configuration
```dockerfile
# Dockerfile
FROM openjdk:17-jre-slim

ARG JAR_FILE=target/*.jar
COPY ${JAR_FILE} app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app.jar"]
```

### 5.3 Kubernetes Deployment
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ecommerce-platform
  labels:
    app: ecommerce-platform
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ecommerce-platform
  template:
    metadata:
      labels:
        app: ecommerce-platform
    spec:
      containers:
      - name: ecommerce-platform
        image: ecommerce-platform:latest
        ports:
        - containerPort: 8080
        env:
        - name: DB_USERNAME
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: username
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
---
apiVersion: v1
kind: Service
metadata:
  name: ecommerce-platform-service
spec:
  selector:
    app: ecommerce-platform
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8080
  type: LoadBalancer
```

This comprehensive Low-Level Design document provides detailed implementation specifications for all components of the e-commerce platform, including complete code examples, database schemas, API specifications, security implementations, and deployment configurations.