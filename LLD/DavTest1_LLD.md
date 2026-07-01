# Low-Level Design Document (LLD)
## Online Shopping Platform - DavTest1

### 1. Component Specifications

#### 1.1 User Service Component

**Class: UserController**
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
    public ResponseEntity<AuthenticationResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthenticationResponse response = userService.authenticateUser(request);
        return ResponseEntity.ok(response);
    }
    
    @GetMapping("/profile/{userId}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<UserProfile> getUserProfile(@PathVariable UUID userId) {
        UserProfile profile = userService.getUserProfile(userId);
        return ResponseEntity.ok(profile);
    }
    
    @PutMapping("/profile/{userId}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<UserProfile> updateUserProfile(
            @PathVariable UUID userId, 
            @Valid @RequestBody UserProfileUpdateRequest request) {
        UserProfile updatedProfile = userService.updateUserProfile(userId, request);
        return ResponseEntity.ok(updatedProfile);
    }
}
```

**Class: UserService**
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
    private AuditService auditService;
    
    public UserResponse registerUser(UserRegistrationRequest request) {
        // Input validation
        validateUserRegistration(request);
        
        // Check if user already exists
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new UserAlreadyExistsException("User with email already exists");
        }
        
        // Create new user entity
        User user = User.builder()
            .userId(UUID.randomUUID())
            .email(request.getEmail())
            .password(passwordEncoder.encode(request.getPassword()))
            .firstName(request.getFirstName())
            .lastName(request.getLastName())
            .phone(request.getPhone())
            .role(UserRole.CONSUMER)
            .isActive(true)
            .createdAt(LocalDateTime.now())
            .updatedAt(LocalDateTime.now())
            .build();
        
        User savedUser = userRepository.save(user);
        
        // Create user profile
        createUserProfile(savedUser);
        
        // Audit logging
        auditService.logUserAction(savedUser.getUserId(), "USER_REGISTRATION", "User registered successfully");
        
        return UserResponse.from(savedUser);
    }
    
    public AuthenticationResponse authenticateUser(LoginRequest request) {
        // Validate credentials
        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new InvalidCredentialsException("Invalid email or password"));
        
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            auditService.logSecurityEvent(user.getUserId(), "FAILED_LOGIN_ATTEMPT", request.getEmail());
            throw new InvalidCredentialsException("Invalid email or password");
        }
        
        if (!user.getIsActive()) {
            throw new AccountDisabledException("Account is disabled");
        }
        
        // Generate JWT tokens
        String accessToken = jwtTokenProvider.generateAccessToken(user);
        String refreshToken = jwtTokenProvider.generateRefreshToken(user);
        
        // Audit successful login
        auditService.logUserAction(user.getUserId(), "SUCCESSFUL_LOGIN", "User logged in successfully");
        
        return AuthenticationResponse.builder()
            .accessToken(accessToken)
            .refreshToken(refreshToken)
            .expiresIn(jwtTokenProvider.getAccessTokenExpiration())
            .user(UserResponse.from(user))
            .build();
    }
}
```

#### 1.2 Product Service Component

**Class: ProductController**
```java
@RestController
@RequestMapping("/api/v1/products")
public class ProductController {
    
    @Autowired
    private ProductService productService;
    
    @GetMapping
    public ResponseEntity<PagedResponse<ProductResponse>> getProducts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) UUID categoryId,
            @RequestParam(defaultValue = "createdAt") String sortBy,
            @RequestParam(defaultValue = "desc") String sortDir) {
        
        ProductSearchCriteria criteria = ProductSearchCriteria.builder()
            .search(search)
            .categoryId(categoryId)
            .page(page)
            .size(size)
            .sortBy(sortBy)
            .sortDirection(sortDir)
            .build();
            
        PagedResponse<ProductResponse> products = productService.searchProducts(criteria);
        return ResponseEntity.ok(products);
    }
    
    @GetMapping("/{productId}")
    public ResponseEntity<ProductDetailResponse> getProduct(@PathVariable UUID productId) {
        ProductDetailResponse product = productService.getProductDetails(productId);
        return ResponseEntity.ok(product);
    }
    
    @PostMapping
    @PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
    public ResponseEntity<ProductResponse> createProduct(@Valid @RequestBody ProductCreateRequest request) {
        ProductResponse product = productService.createProduct(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(product);
    }
    
    @PutMapping("/{productId}")
    @PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
    public ResponseEntity<ProductResponse> updateProduct(
            @PathVariable UUID productId,
            @Valid @RequestBody ProductUpdateRequest request) {
        ProductResponse product = productService.updateProduct(productId, request);
        return ResponseEntity.ok(product);
    }
}
```

**Class: ProductService**
```java
@Service
@Transactional
public class ProductService {
    
    @Autowired
    private ProductRepository productRepository;
    
    @Autowired
    private ElasticsearchTemplate elasticsearchTemplate;
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    @Autowired
    private AuditService auditService;
    
    public PagedResponse<ProductResponse> searchProducts(ProductSearchCriteria criteria) {
        // Check cache first
        String cacheKey = generateCacheKey(criteria);
        PagedResponse<ProductResponse> cachedResult = 
            (PagedResponse<ProductResponse>) redisTemplate.opsForValue().get(cacheKey);
        
        if (cachedResult != null) {
            return cachedResult;
        }
        
        // Search in Elasticsearch
        SearchQuery searchQuery = buildSearchQuery(criteria);
        Page<ProductDocument> searchResults = elasticsearchTemplate.queryForPage(searchQuery, ProductDocument.class);
        
        // Convert to response objects
        List<ProductResponse> products = searchResults.getContent().stream()
            .map(this::convertToProductResponse)
            .collect(Collectors.toList());
        
        PagedResponse<ProductResponse> result = PagedResponse.<ProductResponse>builder()
            .content(products)
            .page(criteria.getPage())
            .size(criteria.getSize())
            .totalElements(searchResults.getTotalElements())
            .totalPages(searchResults.getTotalPages())
            .build();
        
        // Cache the result
        redisTemplate.opsForValue().set(cacheKey, result, Duration.ofMinutes(15));
        
        return result;
    }
    
    public ProductResponse createProduct(ProductCreateRequest request) {
        // Validate product data
        validateProductRequest(request);
        
        // Create product entity
        Product product = Product.builder()
            .productId(UUID.randomUUID())
            .name(request.getName())
            .description(request.getDescription())
            .price(request.getPrice())
            .categoryId(request.getCategoryId())
            .sellerId(getCurrentUserId())
            .inventory(request.getInventory())
            .images(request.getImages())
            .isActive(true)
            .createdAt(LocalDateTime.now())
            .updatedAt(LocalDateTime.now())
            .build();
        
        Product savedProduct = productRepository.save(product);
        
        // Index in Elasticsearch
        indexProductInElasticsearch(savedProduct);
        
        // Clear related caches
        clearProductCaches();
        
        // Audit logging
        auditService.logUserAction(getCurrentUserId(), "PRODUCT_CREATED", 
            "Product created: " + savedProduct.getName());
        
        return ProductResponse.from(savedProduct);
    }
}
```

#### 1.3 Order Service Component

**Class: OrderController**
```java
@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {
    
    @Autowired
    private OrderService orderService;
    
    @PostMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<OrderResponse> createOrder(@Valid @RequestBody OrderCreateRequest request) {
        OrderResponse order = orderService.createOrder(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(order);
    }
    
    @GetMapping("/{orderId}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<OrderDetailResponse> getOrder(@PathVariable UUID orderId) {
        OrderDetailResponse order = orderService.getOrderDetails(orderId);
        return ResponseEntity.ok(order);
    }
    
    @PutMapping("/{orderId}/status")
    @PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
    public ResponseEntity<OrderResponse> updateOrderStatus(
            @PathVariable UUID orderId,
            @Valid @RequestBody OrderStatusUpdateRequest request) {
        OrderResponse order = orderService.updateOrderStatus(orderId, request);
        return ResponseEntity.ok(order);
    }
    
    @PostMapping("/{orderId}/cancel")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<OrderResponse> cancelOrder(@PathVariable UUID orderId) {
        OrderResponse order = orderService.cancelOrder(orderId);
        return ResponseEntity.ok(order);
    }
}
```

**Class: OrderService**
```java
@Service
@Transactional
public class OrderService {
    
    @Autowired
    private OrderRepository orderRepository;
    
    @Autowired
    private ProductService productService;
    
    @Autowired
    private PaymentService paymentService;
    
    @Autowired
    private NotificationService notificationService;
    
    @Autowired
    private InventoryService inventoryService;
    
    @Autowired
    private AuditService auditService;
    
    public OrderResponse createOrder(OrderCreateRequest request) {
        // Validate order items and availability
        validateOrderItems(request.getItems());
        
        // Calculate total amount
        BigDecimal totalAmount = calculateTotalAmount(request.getItems());
        
        // Reserve inventory
        List<InventoryReservation> reservations = inventoryService.reserveItems(request.getItems());
        
        try {
            // Create order entity
            Order order = Order.builder()
                .orderId(UUID.randomUUID())
                .userId(getCurrentUserId())
                .totalAmount(totalAmount)
                .status(OrderStatus.PENDING)
                .shippingAddress(request.getShippingAddress())
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
            
            Order savedOrder = orderRepository.save(order);
            
            // Create order items
            List<OrderItem> orderItems = createOrderItems(savedOrder.getOrderId(), request.getItems());
            savedOrder.setItems(orderItems);
            
            // Process payment
            PaymentRequest paymentRequest = PaymentRequest.builder()
                .orderId(savedOrder.getOrderId())
                .amount(totalAmount)
                .paymentMethod(request.getPaymentMethod())
                .paymentDetails(request.getPaymentDetails())
                .build();
            
            PaymentResponse paymentResponse = paymentService.processPayment(paymentRequest);
            
            if (paymentResponse.getStatus() == PaymentStatus.SUCCESS) {
                // Confirm inventory reservations
                inventoryService.confirmReservations(reservations);
                
                // Update order status
                savedOrder.setStatus(OrderStatus.CONFIRMED);
                savedOrder.setUpdatedAt(LocalDateTime.now());
                orderRepository.save(savedOrder);
                
                // Send confirmation notification
                notificationService.sendOrderConfirmation(savedOrder);
                
                // Audit logging
                auditService.logUserAction(getCurrentUserId(), "ORDER_CREATED", 
                    "Order created: " + savedOrder.getOrderId());
                
                return OrderResponse.from(savedOrder);
            } else {
                // Release inventory reservations
                inventoryService.releaseReservations(reservations);
                throw new PaymentFailedException("Payment processing failed");
            }
            
        } catch (Exception e) {
            // Release inventory reservations on any failure
            inventoryService.releaseReservations(reservations);
            throw e;
        }
    }
}
```

### 2. Data Flow Diagrams

#### 2.1 User Registration Flow
```
Client Request → API Gateway → User Service → Database
     ↓              ↓             ↓            ↓
Validation → Authentication → User Creation → Profile Creation
     ↓              ↓             ↓            ↓
Audit Log → Response → Cache Update → Notification
```

#### 2.2 Product Search Flow
```
Search Request → API Gateway → Product Service → Cache Check
      ↓             ↓              ↓             ↓
   Validation → Authorization → Cache Miss → Elasticsearch
      ↓             ↓              ↓             ↓
   Results → Response Format → Cache Store → Client Response
```

#### 2.3 Order Creation Flow
```
Order Request → API Gateway → Order Service → Inventory Check
     ↓             ↓             ↓              ↓
Validation → Authorization → Item Validation → Reservation
     ↓             ↓             ↓              ↓
Payment → Order Creation → Confirmation → Notification
```

### 3. Sequence Diagrams

#### 3.1 User Authentication Sequence
```
Client          API Gateway     Auth Service    Database       Cache
  |                 |               |             |             |
  |-- Login Req --> |               |             |             |
  |                 |-- Validate -->|             |             |
  |                 |               |-- Query --> |             |
  |                 |               |<-- User --- |             |
  |                 |               |-- Verify Password        |
  |                 |               |-- Generate JWT           |
  |                 |               |-- Store -->|             |
  |                 |<-- Token ---- |             |             |
  |<-- Response --- |               |             |             |
```

#### 3.2 Product Purchase Sequence
```
Client    API Gateway  Order Service  Payment Service  Inventory  Notification
  |           |             |              |              |           |
  |-- Order->|             |              |              |           |
  |           |-- Create -->|              |              |           |
  |           |             |-- Reserve -->|              |           |
  |           |             |<-- Reserved -|              |           |
  |           |             |-- Payment -->|              |           |
  |           |             |<-- Success --|              |           |
  |           |             |-- Confirm -->|              |           |
  |           |             |-- Notify --->|              |           |
  |           |<-- Order ---|              |              |           |
  |<-- Resp --|             |              |              |           |
```

### 4. Implementation Details

#### 4.1 Database Schema

**Users Table**
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(20) NOT NULL DEFAULT 'CONSUMER',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_role CHECK (role IN ('CONSUMER', 'SELLER', 'ADMIN'))
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);
```

**Products Table**
```sql
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    category_id UUID NOT NULL,
    seller_id UUID NOT NULL,
    inventory INTEGER DEFAULT 0,
    images JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    FOREIGN KEY (seller_id) REFERENCES users(user_id)
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_name ON products USING gin(to_tsvector('english', name));
```

**Orders Table**
```sql
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    shipping_address JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    CONSTRAINT chk_status CHECK (status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'))
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(created_at);
```

#### 4.2 API Specifications

**User Registration API**
```yaml
POST /api/v1/users/register
Content-Type: application/json

Request Body:
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"
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
```

**Product Search API**
```yaml
GET /api/v1/products?search=laptop&categoryId=123&page=0&size=20
Authorization: Bearer <jwt_token>

Response (200 OK):
{
  "content": [
    {
      "productId": "456e7890-e89b-12d3-a456-426614174001",
      "name": "Gaming Laptop",
      "description": "High-performance gaming laptop",
      "price": 1299.99,
      "categoryId": "123e4567-e89b-12d3-a456-426614174002",
      "sellerId": "789e0123-e89b-12d3-a456-426614174003",
      "inventory": 50,
      "images": ["image1.jpg", "image2.jpg"],
      "isActive": true
    }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1
}
```

#### 4.3 Security Implementation

**JWT Token Configuration**
```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    
    @Bean
    public JwtTokenProvider jwtTokenProvider() {
        return JwtTokenProvider.builder()
            .secretKey(environment.getProperty("jwt.secret"))
            .accessTokenExpiration(Duration.ofMinutes(15))
            .refreshTokenExpiration(Duration.ofDays(7))
            .build();
    }
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf().disable()
            .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            .and()
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/users/register", "/api/v1/users/login").permitAll()
                .requestMatchers("/api/v1/products/**").hasAnyRole("USER", "SELLER", "ADMIN")
                .requestMatchers("/api/v1/orders/**").hasAnyRole("USER", "ADMIN")
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthenticationFilter(), UsernamePasswordAuthenticationFilter.class)
            .build();
    }
}
```

**Input Validation**
```java
public class UserRegistrationRequest {
    
    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    @Size(max = 255, message = "Email must not exceed 255 characters")
    private String email;
    
    @NotBlank(message = "Password is required")
    @Size(min = 8, max = 128, message = "Password must be between 8 and 128 characters")
    @Pattern(regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]", 
             message = "Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character")
    private String password;
    
    @NotBlank(message = "First name is required")
    @Size(max = 100, message = "First name must not exceed 100 characters")
    @Pattern(regexp = "^[a-zA-Z\\s]+$", message = "First name must contain only letters and spaces")
    private String firstName;
    
    @NotBlank(message = "Last name is required")
    @Size(max = 100, message = "Last name must not exceed 100 characters")
    @Pattern(regexp = "^[a-zA-Z\\s]+$", message = "Last name must contain only letters and spaces")
    private String lastName;
    
    @Pattern(regexp = "^\\+?[1-9]\\d{1,14}$", message = "Invalid phone number format")
    private String phone;
}
```

#### 4.4 Error Handling

**Global Exception Handler**
```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(ValidationException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("VALIDATION_ERROR")
            .message("Input validation failed")
            .details(ex.getErrors())
            .timestamp(LocalDateTime.now())
            .build();
        return ResponseEntity.badRequest().body(error);
    }
    
    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleUserNotFoundException(UserNotFoundException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("USER_NOT_FOUND")
            .message(ex.getMessage())
            .timestamp(LocalDateTime.now())
            .build();
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }
    
    @ExceptionHandler(PaymentFailedException.class)
    public ResponseEntity<ErrorResponse> handlePaymentFailedException(PaymentFailedException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("PAYMENT_FAILED")
            .message("Payment processing failed")
            .timestamp(LocalDateTime.now())
            .build();
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(error);
    }
    
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(Exception ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("INTERNAL_SERVER_ERROR")
            .message("An unexpected error occurred")
            .timestamp(LocalDateTime.now())
            .build();
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }
}
```

#### 4.5 Caching Strategy

**Redis Configuration**
```java
@Configuration
@EnableCaching
public class CacheConfig {
    
    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(new GenericJackson2JsonRedisSerializer());
        return template;
    }
    
    @Bean
    public CacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(15))
            .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(new GenericJackson2JsonRedisSerializer()));
        
        return RedisCacheManager.builder(connectionFactory)
            .cacheDefaults(config)
            .build();
    }
}
```

**Cache Usage**
```java
@Service
public class ProductService {
    
    @Cacheable(value = "products", key = "#productId")
    public ProductDetailResponse getProductDetails(UUID productId) {
        Product product = productRepository.findById(productId)
            .orElseThrow(() -> new ProductNotFoundException("Product not found"));
        return ProductDetailResponse.from(product);
    }
    
    @CacheEvict(value = "products", key = "#productId")
    public ProductResponse updateProduct(UUID productId, ProductUpdateRequest request) {
        // Update logic
    }
    
    @CacheEvict(value = "products", allEntries = true)
    public void clearAllProductCache() {
        // Clear all product cache entries
    }
}
```

### 5. Performance Optimizations

#### 5.1 Database Optimizations

**Connection Pooling**
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

**Query Optimization**
```java
@Repository
public interface ProductRepository extends JpaRepository<Product, UUID> {
    
    @Query("SELECT p FROM Product p JOIN FETCH p.category WHERE p.isActive = true")
    List<Product> findActiveProductsWithCategory();
    
    @Query(value = "SELECT * FROM products WHERE to_tsvector('english', name || ' ' || description) @@ plainto_tsquery(:search)", 
           nativeQuery = true)
    List<Product> searchProducts(@Param("search") String search);
    
    @Modifying
    @Query("UPDATE Product p SET p.inventory = p.inventory - :quantity WHERE p.productId = :productId AND p.inventory >= :quantity")
    int decrementInventory(@Param("productId") UUID productId, @Param("quantity") int quantity);
}
```

#### 5.2 Elasticsearch Configuration

**Product Document Mapping**
```java
@Document(indexName = "products")
public class ProductDocument {
    
    @Id
    private String productId;
    
    @Field(type = FieldType.Text, analyzer = "standard")
    private String name;
    
    @Field(type = FieldType.Text, analyzer = "standard")
    private String description;
    
    @Field(type = FieldType.Double)
    private BigDecimal price;
    
    @Field(type = FieldType.Keyword)
    private String categoryId;
    
    @Field(type = FieldType.Integer)
    private Integer inventory;
    
    @Field(type = FieldType.Boolean)
    private Boolean isActive;
    
    @Field(type = FieldType.Date, format = DateFormat.date_time)
    private LocalDateTime createdAt;
}
```

### 6. Monitoring and Logging

#### 6.1 Application Metrics

**Micrometer Configuration**
```java
@Configuration
public class MetricsConfig {
    
    @Bean
    public MeterRegistry meterRegistry() {
        return new PrometheusMeterRegistry(PrometheusConfig.DEFAULT);
    }
    
    @Bean
    public TimedAspect timedAspect(MeterRegistry registry) {
        return new TimedAspect(registry);
    }
}

@Service
public class OrderService {
    
    @Timed(name = "order.creation.time", description = "Time taken to create an order")
    @Counted(name = "order.creation.count", description = "Number of orders created")
    public OrderResponse createOrder(OrderCreateRequest request) {
        // Implementation
    }
}
```

#### 6.2 Structured Logging

**Logback Configuration**
```xml
<configuration>
    <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
        <encoder class="net.logstash.logback.encoder.LoggingEventCompositeJsonEncoder">
            <providers>
                <timestamp/>
                <logLevel/>
                <loggerName/>
                <message/>
                <mdc/>
                <stackTrace/>
            </providers>
        </encoder>
    </appender>
    
    <logger name="com.onlineshopping" level="INFO"/>
    <logger name="org.springframework.security" level="DEBUG"/>
    
    <root level="INFO">
        <appender-ref ref="STDOUT"/>
    </root>
</configuration>
```

**Audit Logging Service**
```java
@Service
public class AuditService {
    
    private static final Logger auditLogger = LoggerFactory.getLogger("AUDIT");
    
    public void logUserAction(UUID userId, String action, String details) {
        AuditEvent event = AuditEvent.builder()
            .userId(userId)
            .action(action)
            .details(details)
            .timestamp(LocalDateTime.now())
            .ipAddress(getCurrentUserIP())
            .userAgent(getCurrentUserAgent())
            .build();
        
        auditLogger.info("User action: {}", event);
        
        // Store in database for compliance
        auditRepository.save(event);
    }
    
    public void logSecurityEvent(UUID userId, String eventType, String details) {
        SecurityEvent event = SecurityEvent.builder()
            .userId(userId)
            .eventType(eventType)
            .details(details)
            .timestamp(LocalDateTime.now())
            .ipAddress(getCurrentUserIP())
            .severity(SecuritySeverity.MEDIUM)
            .build();
        
        auditLogger.warn("Security event: {}", event);
        
        // Alert security team for critical events
        if (event.getSeverity() == SecuritySeverity.HIGH) {
            notificationService.sendSecurityAlert(event);
        }
    }
}
```

This comprehensive Low-Level Design document provides detailed implementation specifications for the Online Shopping Platform, including component specifications, data flows, sequence diagrams, database schemas, API specifications, security implementations, error handling, caching strategies, performance optimizations, and monitoring configurations. The design ensures scalability, security, and maintainability while meeting all functional and non-functional requirements.