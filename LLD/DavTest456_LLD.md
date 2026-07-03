# Online Shopping Platform - Low-Level Design Document

## 1. Component Specifications

### 1.1 API Gateway Component

#### Class Structure:
```java
@Component
public class APIGateway {
    private RateLimiter rateLimiter;
    private AuthenticationService authService;
    private RouteResolver routeResolver;
    
    @Autowired
    public APIGateway(RateLimiter rateLimiter, AuthenticationService authService, RouteResolver routeResolver) {
        this.rateLimiter = rateLimiter;
        this.authService = authService;
        this.routeResolver = routeResolver;
    }
    
    public ResponseEntity<Object> routeRequest(HttpServletRequest request) {
        // Rate limiting check
        if (!rateLimiter.isAllowed(request.getRemoteAddr())) {
            return ResponseEntity.status(429).body("Rate limit exceeded");
        }
        
        // Authentication validation
        if (!authService.validateToken(request.getHeader("Authorization"))) {
            return ResponseEntity.status(401).body("Unauthorized");
        }
        
        // Route to appropriate service
        return routeResolver.resolve(request);
    }
}
```

#### Database Schema:
```sql
CREATE TABLE api_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_ip INET NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_ip, endpoint)
);

CREATE INDEX idx_rate_limits_ip_endpoint ON api_rate_limits(client_ip, endpoint);
CREATE INDEX idx_rate_limits_window ON api_rate_limits(window_start);
```

### 1.2 User Service Component

#### Class Structure:
```java
@Entity
@Table(name = "users")
public class User {
    @Id
    @Column(name = "user_id")
    private String userId;
    
    @Column(unique = true, nullable = false)
    private String email;
    
    @Column(nullable = false)
    private String password; // BCrypt encrypted
    
    @Column(name = "first_name")
    private String firstName;
    
    @Column(name = "last_name")
    private String lastName;
    
    private String phone;
    
    @Enumerated(EnumType.STRING)
    private UserRole role;
    
    @Enumerated(EnumType.STRING)
    private UserStatus status;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    // Constructors, getters, setters
}

@Service
public class UserService {
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private PasswordEncoder passwordEncoder;
    
    @Autowired
    private JwtTokenProvider tokenProvider;
    
    public UserRegistrationResponse registerUser(UserRegistrationRequest request) {
        // Input validation
        validateRegistrationRequest(request);
        
        // Check if email already exists
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new UserAlreadyExistsException("Email already registered");
        }
        
        // Create new user
        User user = new User();
        user.setUserId(UUID.randomUUID().toString());
        user.setEmail(request.getEmail());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setFirstName(request.getFirstName());
        user.setLastName(request.getLastName());
        user.setPhone(request.getPhone());
        user.setRole(UserRole.CONSUMER);
        user.setStatus(UserStatus.ACTIVE);
        user.setCreatedAt(LocalDateTime.now());
        user.setUpdatedAt(LocalDateTime.now());
        
        User savedUser = userRepository.save(user);
        
        return new UserRegistrationResponse(savedUser.getUserId(), "User registered successfully");
    }
    
    public AuthenticationResponse authenticateUser(AuthenticationRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new InvalidCredentialsException("Invalid credentials"));
        
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new InvalidCredentialsException("Invalid credentials");
        }
        
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new AccountInactiveException("Account is not active");
        }
        
        String accessToken = tokenProvider.generateAccessToken(user);
        String refreshToken = tokenProvider.generateRefreshToken(user);
        
        return new AuthenticationResponse(accessToken, refreshToken, user.getRole());
    }
}
```

#### Database Schema:
```sql
CREATE TABLE users (
    user_id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(20) NOT NULL CHECK (role IN ('CONSUMER', 'SELLER', 'ADMIN')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
```

### 1.3 Product Service Component

#### Class Structure:
```java
@Entity
@Table(name = "products")
public class Product {
    @Id
    @Column(name = "product_id")
    private String productId;
    
    @Column(name = "seller_id", nullable = false)
    private String sellerId;
    
    @Column(name = "category_id", nullable = false)
    private String categoryId;
    
    @Column(nullable = false)
    private String name;
    
    @Column(columnDefinition = "TEXT")
    private String description;
    
    @Column(precision = 10, scale = 2)
    private BigDecimal price;
    
    @Column(unique = true, nullable = false)
    private String sku;
    
    @Enumerated(EnumType.STRING)
    private ProductStatus status;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}

@Service
public class ProductService {
    @Autowired
    private ProductRepository productRepository;
    
    @Autowired
    private ElasticsearchTemplate elasticsearchTemplate;
    
    @Autowired
    private InventoryService inventoryService;
    
    public ProductResponse createProduct(CreateProductRequest request, String sellerId) {
        // Validate seller permissions
        validateSellerPermissions(sellerId);
        
        // Input validation
        validateProductRequest(request);
        
        // Check SKU uniqueness
        if (productRepository.existsBySku(request.getSku())) {
            throw new DuplicateSkuException("SKU already exists");
        }
        
        Product product = new Product();
        product.setProductId(UUID.randomUUID().toString());
        product.setSellerId(sellerId);
        product.setCategoryId(request.getCategoryId());
        product.setName(request.getName());
        product.setDescription(request.getDescription());
        product.setPrice(request.getPrice());
        product.setSku(request.getSku());
        product.setStatus(ProductStatus.ACTIVE);
        product.setCreatedAt(LocalDateTime.now());
        product.setUpdatedAt(LocalDateTime.now());
        
        Product savedProduct = productRepository.save(product);
        
        // Index in Elasticsearch for search
        indexProductForSearch(savedProduct);
        
        // Initialize inventory
        inventoryService.initializeInventory(savedProduct.getProductId(), request.getInitialStock());
        
        return mapToProductResponse(savedProduct);
    }
    
    public PagedProductResponse searchProducts(ProductSearchRequest request) {
        SearchQuery searchQuery = buildSearchQuery(request);
        SearchHits<ProductDocument> searchHits = elasticsearchTemplate.search(searchQuery, ProductDocument.class);
        
        List<ProductResponse> products = searchHits.getSearchHits().stream()
            .map(hit -> mapToProductResponse(hit.getContent()))
            .collect(Collectors.toList());
        
        return new PagedProductResponse(products, searchHits.getTotalHits(), request.getPage(), request.getSize());
    }
}
```

#### Database Schema:
```sql
CREATE TABLE products (
    product_id VARCHAR(36) PRIMARY KEY,
    seller_id VARCHAR(36) NOT NULL,
    category_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'OUT_OF_STOCK')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (seller_id) REFERENCES users(user_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_price ON products(price);
```

### 1.4 Order Service Component

#### Class Structure:
```java
@Entity
@Table(name = "orders")
public class Order {
    @Id
    @Column(name = "order_id")
    private String orderId;
    
    @Column(name = "user_id", nullable = false)
    private String userId;
    
    @Column(name = "total_amount", precision = 10, scale = 2)
    private BigDecimal totalAmount;
    
    @Enumerated(EnumType.STRING)
    private OrderStatus status;
    
    @Column(name = "shipping_address", columnDefinition = "jsonb")
    private String shippingAddress;
    
    @Column(name = "billing_address", columnDefinition = "jsonb")
    private String billingAddress;
    
    @Column(name = "order_date")
    private LocalDateTime orderDate;
    
    @Column(name = "delivery_date")
    private LocalDateTime deliveryDate;
    
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<OrderItem> orderItems;
}

@Service
@Transactional
public class OrderService {
    @Autowired
    private OrderRepository orderRepository;
    
    @Autowired
    private CartService cartService;
    
    @Autowired
    private InventoryService inventoryService;
    
    @Autowired
    private PaymentService paymentService;
    
    @Autowired
    private NotificationService notificationService;
    
    public OrderResponse createOrder(CreateOrderRequest request, String userId) {
        // Validate cart contents
        Cart cart = cartService.getActiveCart(userId);
        if (cart.getItems().isEmpty()) {
            throw new EmptyCartException("Cannot create order from empty cart");
        }
        
        // Check inventory availability
        validateInventoryAvailability(cart.getItems());
        
        // Create order
        Order order = new Order();
        order.setOrderId(UUID.randomUUID().toString());
        order.setUserId(userId);
        order.setShippingAddress(request.getShippingAddress());
        order.setBillingAddress(request.getBillingAddress());
        order.setOrderDate(LocalDateTime.now());
        order.setStatus(OrderStatus.PENDING);
        
        // Create order items
        List<OrderItem> orderItems = cart.getItems().stream()
            .map(cartItem -> createOrderItem(order, cartItem))
            .collect(Collectors.toList());
        
        order.setOrderItems(orderItems);
        order.setTotalAmount(calculateTotalAmount(orderItems));
        
        Order savedOrder = orderRepository.save(order);
        
        // Reserve inventory
        reserveInventory(orderItems);
        
        // Clear cart
        cartService.clearCart(userId);
        
        // Send order confirmation
        notificationService.sendOrderConfirmation(savedOrder);
        
        return mapToOrderResponse(savedOrder);
    }
    
    public OrderResponse updateOrderStatus(String orderId, OrderStatus newStatus, String updatedBy) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException("Order not found"));
        
        // Validate status transition
        validateStatusTransition(order.getStatus(), newStatus);
        
        OrderStatus previousStatus = order.getStatus();
        order.setStatus(newStatus);
        order.setUpdatedAt(LocalDateTime.now());
        
        if (newStatus == OrderStatus.DELIVERED) {
            order.setDeliveryDate(LocalDateTime.now());
        }
        
        Order updatedOrder = orderRepository.save(order);
        
        // Handle status-specific logic
        handleStatusChange(updatedOrder, previousStatus, newStatus);
        
        // Send status update notification
        notificationService.sendOrderStatusUpdate(updatedOrder);
        
        return mapToOrderResponse(updatedOrder);
    }
}
```

#### Database Schema:
```sql
CREATE TABLE orders (
    order_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
    shipping_address JSONB NOT NULL,
    billing_address JSONB NOT NULL,
    order_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivery_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE order_items (
    order_item_id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
```

### 1.5 Payment Service Component

#### Class Structure:
```java
@Entity
@Table(name = "payments")
public class Payment {
    @Id
    @Column(name = "payment_id")
    private String paymentId;
    
    @Column(name = "order_id", nullable = false)
    private String orderId;
    
    @Column(precision = 10, scale = 2)
    private BigDecimal amount;
    
    @Enumerated(EnumType.STRING)
    private PaymentMethod method;
    
    @Enumerated(EnumType.STRING)
    private PaymentStatus status;
    
    @Column(name = "transaction_id")
    private String transactionId;
    
    @Column(name = "gateway_response", columnDefinition = "jsonb")
    private String gatewayResponse; // Encrypted
    
    @Column(name = "processed_at")
    private LocalDateTime processedAt;
}

@Service
public class PaymentService {
    @Autowired
    private PaymentRepository paymentRepository;
    
    @Autowired
    private PaymentGatewayFactory gatewayFactory;
    
    @Autowired
    private EncryptionService encryptionService;
    
    @Autowired
    private FraudDetectionService fraudDetectionService;
    
    public PaymentResponse processPayment(PaymentRequest request) {
        // Fraud detection check
        FraudCheckResult fraudCheck = fraudDetectionService.checkTransaction(request);
        if (fraudCheck.isHighRisk()) {
            throw new FraudDetectedException("Transaction flagged as high risk");
        }
        
        // Create payment record
        Payment payment = new Payment();
        payment.setPaymentId(UUID.randomUUID().toString());
        payment.setOrderId(request.getOrderId());
        payment.setAmount(request.getAmount());
        payment.setMethod(request.getMethod());
        payment.setStatus(PaymentStatus.PENDING);
        
        Payment savedPayment = paymentRepository.save(payment);
        
        try {
            // Process payment through gateway
            PaymentGateway gateway = gatewayFactory.getGateway(request.getMethod());
            GatewayResponse gatewayResponse = gateway.processPayment(request);
            
            // Update payment with gateway response
            savedPayment.setTransactionId(gatewayResponse.getTransactionId());
            savedPayment.setGatewayResponse(encryptionService.encrypt(gatewayResponse.toJson()));
            savedPayment.setProcessedAt(LocalDateTime.now());
            
            if (gatewayResponse.isSuccess()) {
                savedPayment.setStatus(PaymentStatus.SUCCESS);
            } else {
                savedPayment.setStatus(PaymentStatus.FAILED);
            }
            
            paymentRepository.save(savedPayment);
            
            return mapToPaymentResponse(savedPayment, gatewayResponse);
            
        } catch (PaymentGatewayException e) {
            savedPayment.setStatus(PaymentStatus.FAILED);
            savedPayment.setProcessedAt(LocalDateTime.now());
            paymentRepository.save(savedPayment);
            
            throw new PaymentProcessingException("Payment processing failed", e);
        }
    }
}
```

## 2. Data Flow Diagrams

### 2.1 User Registration Flow
```
Client Request → API Gateway → Rate Limiting Check → Authentication Service
                                     ↓
User Service ← Input Validation ← Request Routing
     ↓
Password Encryption → Database Insert → Email Verification
     ↓
Response Generation → Audit Logging → Client Response
```

### 2.2 Product Search Flow
```
Search Request → API Gateway → Authentication Check → Product Service
                                     ↓
Elasticsearch Query ← Query Building ← Input Sanitization
     ↓
Result Filtering → Cache Update → Response Formatting
     ↓
Client Response ← Performance Logging ← Result Serialization
```

### 2.3 Order Processing Flow
```
Order Request → API Gateway → User Authentication → Order Service
                                     ↓
Cart Validation → Inventory Check → Order Creation
     ↓
Payment Service → Gateway Processing → Status Update
     ↓
Inventory Update → Notification Service → Audit Trail
     ↓
Order Confirmation → Client Response
```

### 2.4 Payment Processing Flow
```
Payment Request → Fraud Detection → Payment Service
                        ↓
Gateway Selection → Encryption → External Gateway
                        ↓
Response Handling → Status Update → Database Update
                        ↓
Notification Trigger → Audit Logging → Client Response
```

## 3. Sequence Diagrams

### 3.1 User Authentication Sequence
```
Client -> API_Gateway: POST /auth/login {email, password}
API_Gateway -> User_Service: authenticate(request)
User_Service -> Database: findByEmail(email)
Database -> User_Service: User entity
User_Service -> Password_Encoder: matches(password, hashedPassword)
Password_Encoder -> User_Service: boolean result
User_Service -> JWT_Provider: generateTokens(user)
JWT_Provider -> User_Service: {accessToken, refreshToken}
User_Service -> Audit_Service: logAuthentication(userId, success)
User_Service -> API_Gateway: AuthenticationResponse
API_Gateway -> Client: 200 OK {tokens, userInfo}
```

### 3.2 Product Creation Sequence
```
Seller -> API_Gateway: POST /products {productData}
API_Gateway -> Auth_Service: validateToken(token)
Auth_Service -> API_Gateway: UserContext
API_Gateway -> Product_Service: createProduct(request, sellerId)
Product_Service -> Validation_Service: validateProductData(request)
Validation_Service -> Product_Service: ValidationResult
Product_Service -> Database: save(product)
Database -> Product_Service: Product entity
Product_Service -> Search_Service: indexProduct(product)
Product_Service -> Inventory_Service: initializeInventory(productId, stock)
Product_Service -> API_Gateway: ProductResponse
API_Gateway -> Seller: 201 Created {product}
```

### 3.3 Order Checkout Sequence
```
Customer -> API_Gateway: POST /orders/checkout {orderData}
API_Gateway -> Order_Service: createOrder(request, userId)
Order_Service -> Cart_Service: getActiveCart(userId)
Cart_Service -> Order_Service: Cart with items
Order_Service -> Inventory_Service: checkAvailability(items)
Inventory_Service -> Order_Service: AvailabilityResult
Order_Service -> Database: save(order)
Order_Service -> Inventory_Service: reserveItems(orderItems)
Order_Service -> Payment_Service: processPayment(paymentRequest)
Payment_Service -> External_Gateway: processTransaction(request)
External_Gateway -> Payment_Service: GatewayResponse
Payment_Service -> Order_Service: PaymentResult
Order_Service -> Notification_Service: sendOrderConfirmation(order)
Order_Service -> API_Gateway: OrderResponse
API_Gateway -> Customer: 201 Created {order}
```

## 4. Implementation Details

### 4.1 Security Implementation

#### JWT Token Management
```java
@Component
public class JwtTokenProvider {
    @Value("${jwt.secret}")
    private String jwtSecret;
    
    @Value("${jwt.access-token-expiration}")
    private int accessTokenExpiration;
    
    @Value("${jwt.refresh-token-expiration}")
    private int refreshTokenExpiration;
    
    public String generateAccessToken(User user) {
        Date expiryDate = new Date(System.currentTimeMillis() + accessTokenExpiration);
        
        return Jwts.builder()
            .setSubject(user.getUserId())
            .claim("email", user.getEmail())
            .claim("role", user.getRole())
            .setIssuedAt(new Date())
            .setExpiration(expiryDate)
            .signWith(SignatureAlgorithm.HS512, jwtSecret)
            .compact();
    }
    
    public String generateRefreshToken(User user) {
        Date expiryDate = new Date(System.currentTimeMillis() + refreshTokenExpiration);
        
        return Jwts.builder()
            .setSubject(user.getUserId())
            .setIssuedAt(new Date())
            .setExpiration(expiryDate)
            .signWith(SignatureAlgorithm.HS512, jwtSecret)
            .compact();
    }
    
    public boolean validateToken(String token) {
        try {
            Jwts.parser().setSigningKey(jwtSecret).parseClaimsJws(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
```

#### Input Validation
```java
@Component
public class InputValidator {
    private static final Pattern EMAIL_PATTERN = 
        Pattern.compile("^[A-Za-z0-9+_.-]+@([A-Za-z0-9.-]+\\.[A-Za-z]{2,})$");
    
    private static final Pattern PHONE_PATTERN = 
        Pattern.compile("^\\+?[1-9]\\d{1,14}$");
    
    public void validateUserRegistration(UserRegistrationRequest request) {
        List<String> errors = new ArrayList<>();
        
        if (StringUtils.isBlank(request.getEmail()) || !EMAIL_PATTERN.matcher(request.getEmail()).matches()) {
            errors.add("Invalid email format");
        }
        
        if (StringUtils.isBlank(request.getPassword()) || request.getPassword().length() < 8) {
            errors.add("Password must be at least 8 characters");
        }
        
        if (!isStrongPassword(request.getPassword())) {
            errors.add("Password must contain uppercase, lowercase, digit, and special character");
        }
        
        if (StringUtils.isBlank(request.getFirstName()) || request.getFirstName().length() > 50) {
            errors.add("First name is required and must be less than 50 characters");
        }
        
        if (StringUtils.isBlank(request.getLastName()) || request.getLastName().length() > 50) {
            errors.add("Last name is required and must be less than 50 characters");
        }
        
        if (StringUtils.isNotBlank(request.getPhone()) && !PHONE_PATTERN.matcher(request.getPhone()).matches()) {
            errors.add("Invalid phone number format");
        }
        
        if (!errors.isEmpty()) {
            throw new ValidationException(String.join(", ", errors));
        }
    }
    
    private boolean isStrongPassword(String password) {
        return password.matches("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$");
    }
}
```

#### Encryption Service
```java
@Service
public class EncryptionService {
    @Value("${encryption.key}")
    private String encryptionKey;
    
    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 16;
    
    public String encrypt(String plainText) {
        try {
            SecretKeySpec secretKey = new SecretKeySpec(encryptionKey.getBytes(), "AES");
            
            byte[] iv = new byte[GCM_IV_LENGTH];
            SecureRandom.getInstanceStrong().nextBytes(iv);
            
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            GCMParameterSpec parameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH * 8, iv);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, parameterSpec);
            
            byte[] encryptedData = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            
            byte[] encryptedWithIv = new byte[iv.length + encryptedData.length];
            System.arraycopy(iv, 0, encryptedWithIv, 0, iv.length);
            System.arraycopy(encryptedData, 0, encryptedWithIv, iv.length, encryptedData.length);
            
            return Base64.getEncoder().encodeToString(encryptedWithIv);
        } catch (Exception e) {
            throw new EncryptionException("Failed to encrypt data", e);
        }
    }
    
    public String decrypt(String encryptedText) {
        try {
            byte[] decodedData = Base64.getDecoder().decode(encryptedText);
            
            byte[] iv = new byte[GCM_IV_LENGTH];
            System.arraycopy(decodedData, 0, iv, 0, iv.length);
            
            byte[] encryptedData = new byte[decodedData.length - GCM_IV_LENGTH];
            System.arraycopy(decodedData, GCM_IV_LENGTH, encryptedData, 0, encryptedData.length);
            
            SecretKeySpec secretKey = new SecretKeySpec(encryptionKey.getBytes(), "AES");
            
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            GCMParameterSpec parameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH * 8, iv);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, parameterSpec);
            
            byte[] decryptedData = cipher.doFinal(encryptedData);
            
            return new String(decryptedData, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new DecryptionException("Failed to decrypt data", e);
        }
    }
}
```

### 4.2 Performance Optimization

#### Caching Strategy
```java
@Service
public class CacheService {
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    private static final String PRODUCT_CACHE_PREFIX = "product:";
    private static final String USER_CACHE_PREFIX = "user:";
    private static final int DEFAULT_TTL = 3600; // 1 hour
    
    public void cacheProduct(Product product) {
        String key = PRODUCT_CACHE_PREFIX + product.getProductId();
        redisTemplate.opsForValue().set(key, product, DEFAULT_TTL, TimeUnit.SECONDS);
    }
    
    public Optional<Product> getCachedProduct(String productId) {
        String key = PRODUCT_CACHE_PREFIX + productId;
        Product product = (Product) redisTemplate.opsForValue().get(key);
        return Optional.ofNullable(product);
    }
    
    public void invalidateProductCache(String productId) {
        String key = PRODUCT_CACHE_PREFIX + productId;
        redisTemplate.delete(key);
    }
    
    public void cacheSearchResults(String searchQuery, List<Product> results) {
        String key = "search:" + DigestUtils.md5Hex(searchQuery);
        redisTemplate.opsForValue().set(key, results, 300, TimeUnit.SECONDS); // 5 minutes
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
      idle-timeout: 300000
      max-lifetime: 1200000
      connection-timeout: 20000
      validation-timeout: 5000
      leak-detection-threshold: 60000
```

### 4.3 Error Handling

#### Global Exception Handler
```java
@ControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(ValidationException e) {
        logger.warn("Validation error: {}", e.getMessage());
        ErrorResponse error = new ErrorResponse("VALIDATION_ERROR", e.getMessage());
        return ResponseEntity.badRequest().body(error);
    }
    
    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleUserNotFoundException(UserNotFoundException e) {
        logger.warn("User not found: {}", e.getMessage());
        ErrorResponse error = new ErrorResponse("USER_NOT_FOUND", "User not found");
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }
    
    @ExceptionHandler(PaymentProcessingException.class)
    public ResponseEntity<ErrorResponse> handlePaymentException(PaymentProcessingException e) {
        logger.error("Payment processing failed", e);
        ErrorResponse error = new ErrorResponse("PAYMENT_FAILED", "Payment processing failed");
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(error);
    }
    
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(Exception e) {
        logger.error("Unexpected error occurred", e);
        ErrorResponse error = new ErrorResponse("INTERNAL_ERROR", "An unexpected error occurred");
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }
}
```

### 4.4 Monitoring and Logging

#### Audit Logging
```java
@Component
public class AuditLogger {
    private static final Logger auditLog = LoggerFactory.getLogger("AUDIT");
    
    public void logUserAction(String userId, String action, String resource, Map<String, Object> details) {
        AuditEvent event = AuditEvent.builder()
            .timestamp(Instant.now())
            .userId(userId)
            .action(action)
            .resource(resource)
            .details(details)
            .ipAddress(getCurrentUserIp())
            .userAgent(getCurrentUserAgent())
            .build();
        
        auditLog.info("AUDIT: {}", objectMapper.writeValueAsString(event));
    }
    
    public void logSecurityEvent(String eventType, String description, String userId) {
        SecurityEvent event = SecurityEvent.builder()
            .timestamp(Instant.now())
            .eventType(eventType)
            .description(description)
            .userId(userId)
            .severity(determineSeverity(eventType))
            .build();
        
        auditLog.warn("SECURITY: {}", objectMapper.writeValueAsString(event));
    }
}
```

#### Performance Monitoring
```java
@Aspect
@Component
public class PerformanceMonitoringAspect {
    private static final Logger perfLog = LoggerFactory.getLogger("PERFORMANCE");
    
    @Around("@annotation(Monitored)")
    public Object monitorPerformance(ProceedingJoinPoint joinPoint) throws Throwable {
        String methodName = joinPoint.getSignature().getName();
        long startTime = System.currentTimeMillis();
        
        try {
            Object result = joinPoint.proceed();
            long executionTime = System.currentTimeMillis() - startTime;
            
            perfLog.info("Method: {} executed in {} ms", methodName, executionTime);
            
            // Send metrics to monitoring system
            meterRegistry.timer("method.execution.time", "method", methodName)
                .record(executionTime, TimeUnit.MILLISECONDS);
            
            return result;
        } catch (Exception e) {
            long executionTime = System.currentTimeMillis() - startTime;
            perfLog.error("Method: {} failed after {} ms", methodName, executionTime, e);
            
            meterRegistry.counter("method.execution.error", "method", methodName).increment();
            
            throw e;
        }
    }
}
```

## 5. Database Design

### 5.1 Complete Database Schema

```sql
-- Categories table
CREATE TABLE categories (
    category_id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_category_id VARCHAR(36),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (parent_category_id) REFERENCES categories(category_id)
);

-- Inventory table
CREATE TABLE inventory (
    inventory_id VARCHAR(36) PRIMARY KEY,
    product_id VARCHAR(36) NOT NULL UNIQUE,
    available_quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 10,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- Shopping cart table
CREATE TABLE carts (
    cart_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Cart items table
CREATE TABLE cart_items (
    cart_item_id VARCHAR(36) PRIMARY KEY,
    cart_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    quantity INTEGER NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (cart_id) REFERENCES carts(cart_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    UNIQUE(cart_id, product_id)
);

-- Reviews table
CREATE TABLE reviews (
    review_id VARCHAR(36) PRIMARY KEY,
    product_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(200),
    comment TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    UNIQUE(product_id, user_id)
);

-- Notifications table
CREATE TABLE notifications (
    notification_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'UNREAD',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Refunds table
CREATE TABLE refunds (
    refund_id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    payment_id VARCHAR(36) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    requested_by VARCHAR(36) NOT NULL,
    processed_by VARCHAR(36),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (payment_id) REFERENCES payments(payment_id),
    FOREIGN KEY (requested_by) REFERENCES users(user_id),
    FOREIGN KEY (processed_by) REFERENCES users(user_id)
);

-- Audit trail table
CREATE TABLE audit_trail (
    audit_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(36),
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_categories_parent ON categories(parent_category_id);
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_quantity ON inventory(available_quantity);
CREATE INDEX idx_carts_user ON carts(user_id);
CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX idx_cart_items_product ON cart_items(product_id);
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_refunds_order ON refunds(order_id);
CREATE INDEX idx_refunds_status ON refunds(status);
CREATE INDEX idx_audit_user ON audit_trail(user_id);
CREATE INDEX idx_audit_timestamp ON audit_trail(timestamp);
CREATE INDEX idx_audit_resource ON audit_trail(resource_type, resource_id);
```

### 5.2 Database Optimization

#### Partitioning Strategy
```sql
-- Partition audit_trail by month
CREATE TABLE audit_trail_y2024m01 PARTITION OF audit_trail
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE audit_trail_y2024m02 PARTITION OF audit_trail
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Create indexes on partitions
CREATE INDEX idx_audit_trail_y2024m01_user ON audit_trail_y2024m01(user_id);
CREATE INDEX idx_audit_trail_y2024m01_timestamp ON audit_trail_y2024m01(timestamp);
```

## 6. API Specifications

### 6.1 REST API Endpoints

#### User Management APIs
```yaml
/api/v1/users:
  post:
    summary: Register new user
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [email, password, firstName, lastName]
            properties:
              email:
                type: string
                format: email
              password:
                type: string
                minLength: 8
              firstName:
                type: string
                maxLength: 50
              lastName:
                type: string
                maxLength: 50
              phone:
                type: string
                pattern: '^\+?[1-9]\d{1,14}$'
    responses:
      201:
        description: User registered successfully
      400:
        description: Invalid input data
      409:
        description: Email already exists

/api/v1/auth/login:
  post:
    summary: Authenticate user
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [email, password]
            properties:
              email:
                type: string
                format: email
              password:
                type: string
    responses:
      200:
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
                user:
                  $ref: '#/components/schemas/User'
      401:
        description: Invalid credentials
```

#### Product Management APIs
```yaml
/api/v1/products:
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
        description: Minimum price filter
        schema:
          type: number
      - name: maxPrice
        in: query
        description: Maximum price filter
        schema:
          type: number
      - name: page
        in: query
        description: Page number
        schema:
          type: integer
          default: 0
      - name: size
        in: query
        description: Page size
        schema:
          type: integer
          default: 20
    responses:
      200:
        description: Products retrieved successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                products:
                  type: array
                  items:
                    $ref: '#/components/schemas/Product'
                totalElements:
                  type: integer
                totalPages:
                  type: integer
                currentPage:
                  type: integer

  post:
    summary: Create new product
    security:
      - bearerAuth: []
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/CreateProductRequest'
    responses:
      201:
        description: Product created successfully
      400:
        description: Invalid input data
      401:
        description: Unauthorized
      403:
        description: Insufficient permissions
```

## 7. Testing Strategy

### 7.1 Unit Testing
```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {
    @Mock
    private UserRepository userRepository;
    
    @Mock
    private PasswordEncoder passwordEncoder;
    
    @Mock
    private JwtTokenProvider tokenProvider;
    
    @InjectMocks
    private UserService userService;
    
    @Test
    void shouldRegisterUserSuccessfully() {
        // Given
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .email("test@example.com")
            .password("Password123!")
            .firstName("John")
            .lastName("Doe")
            .build();
        
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(false);
        when(passwordEncoder.encode(request.getPassword())).thenReturn("hashedPassword");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setUserId("user-123");
            return user;
        });
        
        // When
        UserRegistrationResponse response = userService.registerUser(request);
        
        // Then
        assertThat(response.getUserId()).isEqualTo("user-123");
        assertThat(response.getMessage()).isEqualTo("User registered successfully");
        
        verify(userRepository).existsByEmail(request.getEmail());
        verify(passwordEncoder).encode(request.getPassword());
        verify(userRepository).save(any(User.class));
    }
    
    @Test
    void shouldThrowExceptionWhenEmailAlreadyExists() {
        // Given
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .email("existing@example.com")
            .password("Password123!")
            .firstName("John")
            .lastName("Doe")
            .build();
        
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(true);
        
        // When & Then
        assertThatThrownBy(() -> userService.registerUser(request))
            .isInstanceOf(UserAlreadyExistsException.class)
            .hasMessage("Email already registered");
        
        verify(userRepository).existsByEmail(request.getEmail());
        verify(userRepository, never()).save(any(User.class));
    }
}
```

### 7.2 Integration Testing
```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:testdb",
    "spring.jpa.hibernate.ddl-auto=create-drop"
})
class UserControllerIntegrationTest {
    @Autowired
    private TestRestTemplate restTemplate;
    
    @Autowired
    private UserRepository userRepository;
    
    @Test
    void shouldRegisterUserEndToEnd() {
        // Given
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .email("integration@example.com")
            .password("Password123!")
            .firstName("Integration")
            .lastName("Test")
            .build();
        
        // When
        ResponseEntity<UserRegistrationResponse> response = restTemplate.postForEntity(
            "/api/v1/users", request, UserRegistrationResponse.class);
        
        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().getMessage()).isEqualTo("User registered successfully");
        
        // Verify user is saved in database
        Optional<User> savedUser = userRepository.findByEmail(request.getEmail());
        assertThat(savedUser).isPresent();
        assertThat(savedUser.get().getFirstName()).isEqualTo("Integration");
    }
}
```

### 7.3 Performance Testing
```java
@Test
@Timeout(value = 2, unit = TimeUnit.SECONDS)
void shouldCompleteProductSearchWithinTimeLimit() {
    // Given
    ProductSearchRequest request = ProductSearchRequest.builder()
        .query("laptop")
        .page(0)
        .size(20)
        .build();
    
    // When
    long startTime = System.currentTimeMillis();
    PagedProductResponse response = productService.searchProducts(request);
    long executionTime = System.currentTimeMillis() - startTime;
    
    // Then
    assertThat(response).isNotNull();
    assertThat(executionTime).isLessThan(2000); // Less than 2 seconds
}
```

## 8. Deployment Configuration

### 8.1 Docker Configuration
```dockerfile
# Application Dockerfile
FROM openjdk:17-jre-slim

ARG JAR_FILE=target/*.jar
COPY ${JAR_FILE} app.jar

# Create non-root user
RUN addgroup --system appgroup && adduser --system appuser --ingroup appgroup
USER appuser

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app.jar"]
```

### 8.2 Docker Compose
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - DATABASE_URL=jdbc:postgresql://postgres:5432/ecommerce
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
      - elasticsearch
    networks:
      - ecommerce-network

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=ecommerce
      - POSTGRES_USER=ecommerce_user
      - POSTGRES_PASSWORD=secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - ecommerce-network

  redis:
    image: redis:7-alpine
    networks:
      - ecommerce-network

  elasticsearch:
    image: elasticsearch:8.8.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    networks:
      - ecommerce-network

volumes:
  postgres_data:

networks:
  ecommerce-network:
    driver: bridge
```

### 8.3 Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ecommerce-app
  labels:
    app: ecommerce
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ecommerce
  template:
    metadata:
      labels:
        app: ecommerce
    spec:
      containers:
      - name: ecommerce
        image: ecommerce:latest
        ports:
        - containerPort: 8080
        env:
        - name: SPRING_PROFILES_ACTIVE
          value: "kubernetes"
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
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /actuator/health/readiness
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: ecommerce-service
spec:
  selector:
    app: ecommerce
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
  type: LoadBalancer
```

This comprehensive Low-Level Design document provides detailed implementation specifications for the Online Shopping Platform, including component architectures, database schemas, API specifications, security implementations, and deployment configurations. The design ensures scalability, security, and maintainability while meeting all functional and non-functional requirements.