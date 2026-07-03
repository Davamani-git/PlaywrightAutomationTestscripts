# DavTest12 - Online Shopping Platform Low-Level Design (LLD)

## Executive Summary

This Low-Level Design document provides detailed technical specifications for the DavTest12 Online Shopping Platform, derived from the High-Level Design and Product Requirements Document. The system implements a microservices architecture supporting consumer shopping, seller management, and administrative functions with enterprise-grade security and compliance.

## System Architecture

### Microservices Decomposition

#### 1. User Service
**Technology Stack:** Spring Boot 3.2, PostgreSQL 15, Redis 7
**Port:** 8081
**Database Schema:**
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(20) NOT NULL CHECK (role IN ('CONSUMER', 'SELLER', 'ADMIN')),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    failed_login_attempts INTEGER DEFAULT 0,
    account_locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_addresses (
    address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    address_type VARCHAR(20) CHECK (address_type IN ('SHIPPING', 'BILLING')),
    street_address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    jwt_token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**API Endpoints:**
```java
@RestController
@RequestMapping("/api/v1/users")
public class UserController {
    
    @PostMapping("/register")
    public ResponseEntity<UserRegistrationResponse> registerUser(
        @Valid @RequestBody UserRegistrationRequest request) {
        // Input validation, password hashing, email verification
    }
    
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> authenticateUser(
        @Valid @RequestBody LoginRequest request) {
        // Authentication, JWT generation, session management
    }
    
    @PostMapping("/logout")
    public ResponseEntity<Void> logoutUser(
        @RequestHeader("Authorization") String token) {
        // Session invalidation, token blacklisting
    }
    
    @GetMapping("/profile")
    public ResponseEntity<UserProfile> getUserProfile(
        @AuthenticationPrincipal UserPrincipal user) {
        // Profile retrieval with role-based filtering
    }
    
    @PutMapping("/profile")
    public ResponseEntity<UserProfile> updateUserProfile(
        @AuthenticationPrincipal UserPrincipal user,
        @Valid @RequestBody UpdateProfileRequest request) {
        // Profile updates with audit logging
    }
}
```

**Security Implementation:**
```java
@Service
public class AuthenticationService {
    
    private static final int MAX_LOGIN_ATTEMPTS = 3;
    private static final Duration LOCKOUT_DURATION = Duration.ofMinutes(15);
    
    public LoginResponse authenticate(LoginRequest request) {
        User user = validateCredentials(request);
        
        if (user.isAccountLocked()) {
            throw new AccountLockedException("Account temporarily locked");
        }
        
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            handleFailedLogin(user);
            throw new InvalidCredentialsException("Invalid credentials");
        }
        
        resetFailedAttempts(user);
        return generateTokens(user);
    }
    
    private void handleFailedLogin(User user) {
        user.incrementFailedAttempts();
        if (user.getFailedLoginAttempts() >= MAX_LOGIN_ATTEMPTS) {
            user.lockAccount(LOCKOUT_DURATION);
            notificationService.sendSecurityAlert(user);
        }
        userRepository.save(user);
    }
}
```

#### 2. Product Service
**Technology Stack:** Spring Boot 3.2, PostgreSQL 15, Redis 7, Elasticsearch 8
**Port:** 8082
**Database Schema:**
```sql
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(category_id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    seller_id UUID NOT NULL,
    category_id UUID REFERENCES categories(category_id),
    sku VARCHAR(100) UNIQUE,
    inventory_quantity INTEGER NOT NULL DEFAULT 0 CHECK (inventory_quantity >= 0),
    low_stock_threshold INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    approval_status VARCHAR(20) DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_images (
    image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(product_id),
    image_url VARCHAR(500) NOT NULL,
    alt_text VARCHAR(255),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_attributes (
    attribute_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(product_id),
    attribute_name VARCHAR(100) NOT NULL,
    attribute_value VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Search Implementation:**
```java
@Service
public class ProductSearchService {
    
    @Autowired
    private ElasticsearchRestTemplate elasticsearchTemplate;
    
    public SearchResponse<Product> searchProducts(ProductSearchRequest request) {
        BoolQuery.Builder boolQuery = new BoolQuery.Builder();
        
        // Text search
        if (StringUtils.hasText(request.getQuery())) {
            boolQuery.must(MultiMatchQuery.of(m -> m
                .fields("name^3", "description^2", "attributes.value")
                .query(request.getQuery())
                .type(TextQueryType.BestFields)
                .fuzziness("AUTO")
            ));
        }
        
        // Price range filter
        if (request.getPriceMin() != null || request.getPriceMax() != null) {
            RangeQuery.Builder rangeQuery = new RangeQuery.Builder().field("price");
            if (request.getPriceMin() != null) rangeQuery.gte(JsonData.of(request.getPriceMin()));
            if (request.getPriceMax() != null) rangeQuery.lte(JsonData.of(request.getPriceMax()));
            boolQuery.filter(rangeQuery.build()._toQuery());
        }
        
        // Category filter
        if (request.getCategoryIds() != null && !request.getCategoryIds().isEmpty()) {
            boolQuery.filter(TermsQuery.of(t -> t
                .field("categoryId")
                .terms(TermsQueryField.of(tf -> tf.value(
                    request.getCategoryIds().stream()
                        .map(FieldValue::of)
                        .collect(Collectors.toList())
                )))
            ));
        }
        
        SearchRequest searchRequest = SearchRequest.of(s -> s
            .index("products")
            .query(boolQuery.build()._toQuery())
            .sort(SortOptions.of(so -> so.score(ScoreSort.of(ss -> ss.order(SortOrder.Desc)))))
            .from(request.getOffset())
            .size(request.getLimit())
        );
        
        return elasticsearchTemplate.search(searchRequest, Product.class);
    }
}
```

#### 3. Cart Service
**Technology Stack:** Spring Boot 3.2, Redis 7
**Port:** 8083
**Redis Data Structure:**
```java
@RedisHash("shopping_cart")
public class ShoppingCart {
    @Id
    private String cartId;
    private String userId;
    private List<CartItem> items;
    private BigDecimal totalAmount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    
    @TimeToLive
    private Long ttl = 2592000L; // 30 days
}

@RedisHash("cart_item")
public class CartItem {
    private String productId;
    private String productName;
    private BigDecimal unitPrice;
    private Integer quantity;
    private BigDecimal subtotal;
    private LocalDateTime addedAt;
}
```

**Cart Operations:**
```java
@Service
public class CartService {
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    @Autowired
    private ProductServiceClient productServiceClient;
    
    public CartResponse addToCart(String userId, AddToCartRequest request) {
        // Validate product availability
        Product product = productServiceClient.getProduct(request.getProductId());
        if (product.getInventoryQuantity() < request.getQuantity()) {
            throw new InsufficientInventoryException("Not enough inventory available");
        }
        
        ShoppingCart cart = getOrCreateCart(userId);
        CartItem existingItem = cart.getItems().stream()
            .filter(item -> item.getProductId().equals(request.getProductId()))
            .findFirst()
            .orElse(null);
            
        if (existingItem != null) {
            int newQuantity = existingItem.getQuantity() + request.getQuantity();
            if (newQuantity > product.getInventoryQuantity()) {
                throw new InsufficientInventoryException("Total quantity exceeds available inventory");
            }
            existingItem.setQuantity(newQuantity);
            existingItem.setSubtotal(product.getPrice().multiply(BigDecimal.valueOf(newQuantity)));
        } else {
            CartItem newItem = CartItem.builder()
                .productId(request.getProductId())
                .productName(product.getName())
                .unitPrice(product.getPrice())
                .quantity(request.getQuantity())
                .subtotal(product.getPrice().multiply(BigDecimal.valueOf(request.getQuantity())))
                .addedAt(LocalDateTime.now())
                .build();
            cart.getItems().add(newItem);
        }
        
        cart.setTotalAmount(calculateTotal(cart.getItems()));
        cart.setUpdatedAt(LocalDateTime.now());
        
        redisTemplate.opsForValue().set("cart:" + userId, cart, Duration.ofDays(30));
        
        return CartResponse.from(cart);
    }
    
    public CartResponse updateCartItem(String userId, String productId, UpdateCartItemRequest request) {
        ShoppingCart cart = getCart(userId);
        if (cart == null) {
            throw new CartNotFoundException("Cart not found");
        }
        
        CartItem item = cart.getItems().stream()
            .filter(cartItem -> cartItem.getProductId().equals(productId))
            .findFirst()
            .orElseThrow(() -> new CartItemNotFoundException("Item not found in cart"));
            
        if (request.getQuantity() <= 0) {
            cart.getItems().remove(item);
        } else {
            // Validate inventory
            Product product = productServiceClient.getProduct(productId);
            if (request.getQuantity() > product.getInventoryQuantity()) {
                throw new InsufficientInventoryException("Requested quantity exceeds available inventory");
            }
            
            item.setQuantity(request.getQuantity());
            item.setSubtotal(item.getUnitPrice().multiply(BigDecimal.valueOf(request.getQuantity())));
        }
        
        cart.setTotalAmount(calculateTotal(cart.getItems()));
        cart.setUpdatedAt(LocalDateTime.now());
        
        redisTemplate.opsForValue().set("cart:" + userId, cart, Duration.ofDays(30));
        
        return CartResponse.from(cart);
    }
}
```

#### 4. Order Service
**Technology Stack:** Spring Boot 3.2, PostgreSQL 15
**Port:** 8084
**Database Schema:**
```sql
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    shipping_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    shipping_address_id UUID NOT NULL,
    billing_address_id UUID NOT NULL,
    payment_method VARCHAR(50),
    estimated_delivery_date DATE,
    tracking_number VARCHAR(100),
    carrier VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id),
    product_id UUID NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    seller_id UUID NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(10,2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_status_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(order_id),
    previous_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    changed_by UUID,
    change_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Order State Machine:**
```java
@Component
public class OrderStateMachine {
    
    private static final Map<OrderStatus, Set<OrderStatus>> VALID_TRANSITIONS = Map.of(
        OrderStatus.PENDING, Set.of(OrderStatus.CONFIRMED, OrderStatus.CANCELLED),
        OrderStatus.CONFIRMED, Set.of(OrderStatus.PROCESSING, OrderStatus.CANCELLED),
        OrderStatus.PROCESSING, Set.of(OrderStatus.SHIPPED, OrderStatus.CANCELLED),
        OrderStatus.SHIPPED, Set.of(OrderStatus.DELIVERED),
        OrderStatus.DELIVERED, Set.of(),
        OrderStatus.CANCELLED, Set.of()
    );
    
    public boolean isValidTransition(OrderStatus from, OrderStatus to) {
        return VALID_TRANSITIONS.getOrDefault(from, Set.of()).contains(to);
    }
    
    @EventListener
    public void handleOrderStatusChange(OrderStatusChangeEvent event) {
        Order order = event.getOrder();
        OrderStatus newStatus = event.getNewStatus();
        
        if (!isValidTransition(order.getStatus(), newStatus)) {
            throw new InvalidOrderTransitionException(
                String.format("Invalid transition from %s to %s", order.getStatus(), newStatus)
            );
        }
        
        OrderStatus previousStatus = order.getStatus();
        order.setStatus(newStatus);
        order.setUpdatedAt(LocalDateTime.now());
        
        // Save status history
        OrderStatusHistory history = OrderStatusHistory.builder()
            .orderId(order.getOrderId())
            .previousStatus(previousStatus)
            .newStatus(newStatus)
            .changedBy(event.getChangedBy())
            .changeReason(event.getReason())
            .createdAt(LocalDateTime.now())
            .build();
            
        orderStatusHistoryRepository.save(history);
        orderRepository.save(order);
        
        // Trigger notifications
        notificationService.sendOrderStatusNotification(order, previousStatus, newStatus);
        
        // Handle inventory and other side effects
        handleStatusChangeEffects(order, previousStatus, newStatus);
    }
}
```

#### 5. Payment Service
**Technology Stack:** Spring Boot 3.2, PostgreSQL 15
**Port:** 8085
**PCI DSS Compliance Implementation:**
```java
@Service
public class PaymentService {
    
    @Autowired
    private PaymentGatewayFactory gatewayFactory;
    
    @Autowired
    private TokenizationService tokenizationService;
    
    @Autowired
    private FraudDetectionService fraudDetectionService;
    
    @Transactional
    public PaymentResponse processPayment(PaymentRequest request) {
        // Fraud detection
        FraudAssessment fraudAssessment = fraudDetectionService.assessPayment(request);
        if (fraudAssessment.getRiskLevel() == RiskLevel.HIGH) {
            throw new PaymentDeclinedException("Payment declined due to fraud risk");
        }
        
        // Tokenize sensitive payment data
        String paymentToken = tokenizationService.tokenizePaymentMethod(request.getPaymentMethod());
        
        try {
            PaymentGateway gateway = gatewayFactory.getGateway(request.getPaymentMethod().getType());
            
            PaymentGatewayRequest gatewayRequest = PaymentGatewayRequest.builder()
                .amount(request.getAmount())
                .currency(request.getCurrency())
                .paymentToken(paymentToken)
                .orderId(request.getOrderId())
                .build();
                
            PaymentGatewayResponse gatewayResponse = gateway.processPayment(gatewayRequest);
            
            // Save payment record
            Payment payment = Payment.builder()
                .paymentId(UUID.randomUUID())
                .orderId(request.getOrderId())
                .amount(request.getAmount())
                .currency(request.getCurrency())
                .paymentMethodToken(paymentToken)
                .gatewayTransactionId(gatewayResponse.getTransactionId())
                .status(mapGatewayStatus(gatewayResponse.getStatus()))
                .processedAt(LocalDateTime.now())
                .build();
                
            paymentRepository.save(payment);
            
            // Publish payment event
            eventPublisher.publishEvent(new PaymentProcessedEvent(payment));
            
            return PaymentResponse.builder()
                .paymentId(payment.getPaymentId())
                .status(payment.getStatus())
                .transactionId(payment.getGatewayTransactionId())
                .build();
                
        } catch (PaymentGatewayException e) {
            // Handle payment failures
            Payment failedPayment = Payment.builder()
                .paymentId(UUID.randomUUID())
                .orderId(request.getOrderId())
                .amount(request.getAmount())
                .status(PaymentStatus.FAILED)
                .failureReason(e.getMessage())
                .processedAt(LocalDateTime.now())
                .build();
                
            paymentRepository.save(failedPayment);
            
            throw new PaymentProcessingException("Payment processing failed: " + e.getMessage());
        }
    }
}
```

**Tokenization Service:**
```java
@Service
public class TokenizationService {
    
    @Autowired
    private AESUtil aesUtil;
    
    @Value("${payment.tokenization.key}")
    private String tokenizationKey;
    
    public String tokenizePaymentMethod(PaymentMethod paymentMethod) {
        try {
            String sensitiveData = objectMapper.writeValueAsString(paymentMethod);
            String encryptedData = aesUtil.encrypt(sensitiveData, tokenizationKey);
            
            PaymentToken token = PaymentToken.builder()
                .tokenId(UUID.randomUUID().toString())
                .encryptedData(encryptedData)
                .paymentMethodType(paymentMethod.getType())
                .lastFourDigits(extractLastFourDigits(paymentMethod))
                .expiryDate(paymentMethod.getExpiryDate())
                .createdAt(LocalDateTime.now())
                .build();
                
            paymentTokenRepository.save(token);
            
            return token.getTokenId();
            
        } catch (Exception e) {
            throw new TokenizationException("Failed to tokenize payment method", e);
        }
    }
    
    public PaymentMethod detokenizePaymentMethod(String tokenId) {
        PaymentToken token = paymentTokenRepository.findByTokenId(tokenId)
            .orElseThrow(() -> new TokenNotFoundException("Payment token not found"));
            
        try {
            String decryptedData = aesUtil.decrypt(token.getEncryptedData(), tokenizationKey);
            return objectMapper.readValue(decryptedData, PaymentMethod.class);
        } catch (Exception e) {
            throw new DetokenizationException("Failed to detokenize payment method", e);
        }
    }
}
```

#### 6. Notification Service
**Technology Stack:** Spring Boot 3.2, RabbitMQ, PostgreSQL 15
**Port:** 8086
**Message Queue Implementation:**
```java
@Component
public class NotificationEventListener {
    
    @Autowired
    private EmailService emailService;
    
    @Autowired
    private SmsService smsService;
    
    @Autowired
    private PushNotificationService pushNotificationService;
    
    @RabbitListener(queues = "order.status.changed")
    public void handleOrderStatusChange(OrderStatusChangeEvent event) {
        User user = userServiceClient.getUser(event.getUserId());
        NotificationPreferences preferences = getNotificationPreferences(user.getUserId());
        
        if (preferences.isEmailEnabled()) {
            EmailTemplate template = getOrderStatusEmailTemplate(event.getNewStatus());
            EmailMessage message = EmailMessage.builder()
                .to(user.getEmail())
                .subject(template.getSubject())
                .body(template.render(event))
                .build();
            emailService.sendEmail(message);
        }
        
        if (preferences.isSmsEnabled() && user.getPhone() != null) {
            SmsTemplate template = getOrderStatusSmsTemplate(event.getNewStatus());
            SmsMessage message = SmsMessage.builder()
                .to(user.getPhone())
                .body(template.render(event))
                .build();
            smsService.sendSms(message);
        }
    }
    
    @RabbitListener(queues = "user.security.alert")
    public void handleSecurityAlert(SecurityAlertEvent event) {
        User user = userServiceClient.getUser(event.getUserId());
        
        EmailTemplate template = getSecurityAlertEmailTemplate(event.getAlertType());
        EmailMessage message = EmailMessage.builder()
            .to(user.getEmail())
            .subject("Security Alert - DavTest12")
            .body(template.render(event))
            .priority(EmailPriority.HIGH)
            .build();
            
        emailService.sendEmail(message);
    }
}
```

### API Gateway Configuration
**Technology:** Kong Gateway
**Configuration:**
```yaml
services:
  - name: user-service
    url: http://user-service:8081
    routes:
      - name: user-routes
        paths:
          - /api/v1/users
        methods:
          - GET
          - POST
          - PUT
          - DELETE
        plugins:
          - name: jwt
            config:
              secret_is_base64: false
              key_claim_name: sub
          - name: rate-limiting
            config:
              minute: 1000
              policy: local
              fault_tolerant: true
              hide_client_headers: false

  - name: product-service
    url: http://product-service:8082
    routes:
      - name: product-routes
        paths:
          - /api/v1/products
        methods:
          - GET
          - POST
          - PUT
          - DELETE
        plugins:
          - name: cors
            config:
              origins:
                - "*"
              methods:
                - GET
                - POST
                - PUT
                - DELETE
              headers:
                - Accept
                - Authorization
                - Content-Type
          - name: response-transformer
            config:
              remove:
                headers:
                  - "X-Internal-Header"
```

### Database Design

#### Connection Pooling Configuration
```yaml
spring:
  datasource:
    hikari:
      connection-timeout: 20000
      minimum-idle: 10
      maximum-pool-size: 50
      idle-timeout: 300000
      max-lifetime: 1200000
      auto-commit: false
  jpa:
    hibernate:
      ddl-auto: validate
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
        jdbc:
          batch_size: 25
        order_inserts: true
        order_updates: true
        jdbc.batch_versioned_data: true
```

#### Database Indexes
```sql
-- User service indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role_active ON users(role, is_active);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Product service indexes
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_seller_id ON products(seller_id);
CREATE INDEX idx_products_name_trgm ON products USING gin(name gin_trgm_ops);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_inventory ON products(inventory_quantity);
CREATE INDEX idx_products_status ON products(approval_status, is_active);

-- Order service indexes
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
CREATE INDEX idx_order_items_seller_id ON order_items(seller_id);
```

### Caching Strategy

#### Redis Configuration
```java
@Configuration
@EnableCaching
public class CacheConfig {
    
    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(10))
            .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(new GenericJackson2JsonRedisSerializer()));
            
        Map<String, RedisCacheConfiguration> cacheConfigurations = new HashMap<>();
        
        // Product cache - longer TTL
        cacheConfigurations.put("products", config.entryTtl(Duration.ofHours(1)));
        
        // User profile cache - medium TTL
        cacheConfigurations.put("user-profiles", config.entryTtl(Duration.ofMinutes(30)));
        
        // Search results cache - short TTL
        cacheConfigurations.put("search-results", config.entryTtl(Duration.ofMinutes(5)));
        
        return RedisCacheManager.builder(connectionFactory)
            .cacheDefaults(config)
            .withInitialCacheConfigurations(cacheConfigurations)
            .build();
    }
}
```

#### Cache Implementation
```java
@Service
public class ProductService {
    
    @Cacheable(value = "products", key = "#productId")
    public Product getProduct(UUID productId) {
        return productRepository.findById(productId)
            .orElseThrow(() -> new ProductNotFoundException("Product not found"));
    }
    
    @CacheEvict(value = "products", key = "#product.productId")
    public Product updateProduct(Product product) {
        return productRepository.save(product);
    }
    
    @Cacheable(value = "search-results", key = "#request.hashCode()")
    public SearchResponse<Product> searchProducts(ProductSearchRequest request) {
        return productSearchService.searchProducts(request);
    }
}
```

### Security Implementation

#### JWT Configuration
```java
@Component
public class JwtTokenProvider {
    
    @Value("${jwt.secret}")
    private String jwtSecret;
    
    @Value("${jwt.expiration}")
    private int jwtExpirationInMs;
    
    @Value("${jwt.refresh.expiration}")
    private int refreshExpirationInMs;
    
    public String generateToken(Authentication authentication) {
        UserPrincipal userPrincipal = (UserPrincipal) authentication.getPrincipal();
        Date expiryDate = new Date(System.currentTimeMillis() + jwtExpirationInMs);
        
        return Jwts.builder()
            .setSubject(userPrincipal.getId().toString())
            .setIssuedAt(new Date())
            .setExpiration(expiryDate)
            .claim("role", userPrincipal.getRole())
            .claim("email", userPrincipal.getEmail())
            .signWith(SignatureAlgorithm.HS512, jwtSecret)
            .compact();
    }
    
    public String generateRefreshToken(UUID userId) {
        Date expiryDate = new Date(System.currentTimeMillis() + refreshExpirationInMs);
        
        return Jwts.builder()
            .setSubject(userId.toString())
            .setIssuedAt(new Date())
            .setExpiration(expiryDate)
            .claim("type", "refresh")
            .signWith(SignatureAlgorithm.HS512, jwtSecret)
            .compact();
    }
}
```

#### Input Validation
```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationExceptions(
            MethodArgumentNotValidException ex) {
        
        Map<String, String> errors = new HashMap<>();
        ex.getBindingResult().getAllErrors().forEach((error) -> {
            String fieldName = ((FieldError) error).getField();
            String errorMessage = error.getDefaultMessage();
            errors.put(fieldName, errorMessage);
        });
        
        ErrorResponse errorResponse = ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(HttpStatus.BAD_REQUEST.value())
            .error("Validation Failed")
            .message("Invalid input data")
            .details(errors)
            .build();
            
        return new ResponseEntity<>(errorResponse, HttpStatus.BAD_REQUEST);
    }
    
    @ExceptionHandler(SQLInjectionAttemptException.class)
    public ResponseEntity<ErrorResponse> handleSQLInjectionAttempt(
            SQLInjectionAttemptException ex, HttpServletRequest request) {
        
        // Log security incident
        securityLogger.warn("SQL injection attempt detected from IP: {} on endpoint: {}", 
            getClientIpAddress(request), request.getRequestURI());
        
        ErrorResponse errorResponse = ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(HttpStatus.BAD_REQUEST.value())
            .error("Invalid Request")
            .message("Request contains invalid characters")
            .build();
            
        return new ResponseEntity<>(errorResponse, HttpStatus.BAD_REQUEST);
    }
}
```

### Monitoring and Observability

#### Application Metrics
```java
@Component
public class CustomMetrics {
    
    private final Counter orderCreatedCounter;
    private final Timer paymentProcessingTimer;
    private final Gauge activeUsersGauge;
    
    public CustomMetrics(MeterRegistry meterRegistry) {
        this.orderCreatedCounter = Counter.builder("orders.created")
            .description("Number of orders created")
            .tag("service", "order-service")
            .register(meterRegistry);
            
        this.paymentProcessingTimer = Timer.builder("payment.processing.time")
            .description("Payment processing time")
            .tag("service", "payment-service")
            .register(meterRegistry);
            
        this.activeUsersGauge = Gauge.builder("users.active")
            .description("Number of active users")
            .tag("service", "user-service")
            .register(meterRegistry, this, CustomMetrics::getActiveUserCount);
    }
    
    public void incrementOrderCreated() {
        orderCreatedCounter.increment();
    }
    
    public Timer.Sample startPaymentTimer() {
        return Timer.start();
    }
    
    public void recordPaymentTime(Timer.Sample sample) {
        sample.stop(paymentProcessingTimer);
    }
    
    private double getActiveUserCount() {
        return userService.getActiveUserCount();
    }
}
```

#### Health Checks
```java
@Component
public class CustomHealthIndicator implements HealthIndicator {
    
    @Autowired
    private DataSource dataSource;
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    @Override
    public Health health() {
        Health.Builder builder = new Health.Builder();
        
        try {
            // Check database connectivity
            try (Connection connection = dataSource.getConnection()) {
                if (connection.isValid(5)) {
                    builder.withDetail("database", "UP");
                } else {
                    builder.down().withDetail("database", "Connection invalid");
                }
            }
            
            // Check Redis connectivity
            try {
                redisTemplate.opsForValue().get("health-check");
                builder.withDetail("redis", "UP");
            } catch (Exception e) {
                builder.down().withDetail("redis", "Connection failed: " + e.getMessage());
            }
            
            // Check external services
            checkExternalServices(builder);
            
            return builder.up().build();
            
        } catch (Exception e) {
            return builder.down().withException(e).build();
        }
    }
    
    private void checkExternalServices(Health.Builder builder) {
        // Check payment gateway
        try {
            paymentGatewayHealthCheck();
            builder.withDetail("payment-gateway", "UP");
        } catch (Exception e) {
            builder.withDetail("payment-gateway", "DOWN: " + e.getMessage());
        }
        
        // Check email service
        try {
            emailServiceHealthCheck();
            builder.withDetail("email-service", "UP");
        } catch (Exception e) {
            builder.withDetail("email-service", "DOWN: " + e.getMessage());
        }
    }
}
```

### Error Handling and Circuit Breaker

#### Hystrix Configuration
```java
@Component
public class ProductServiceClient {
    
    @Autowired
    private RestTemplate restTemplate;
    
    @HystrixCommand(
        fallbackMethod = "getProductFallback",
        commandProperties = {
            @HystrixProperty(name = "execution.isolation.thread.timeoutInMilliseconds", value = "3000"),
            @HystrixProperty(name = "circuitBreaker.requestVolumeThreshold", value = "10"),
            @HystrixProperty(name = "circuitBreaker.errorThresholdPercentage", value = "50"),
            @HystrixProperty(name = "circuitBreaker.sleepWindowInMilliseconds", value = "10000")
        }
    )
    public Product getProduct(UUID productId) {
        String url = "http://product-service/api/v1/products/" + productId;
        return restTemplate.getForObject(url, Product.class);
    }
    
    public Product getProductFallback(UUID productId) {
        // Return cached product or default product
        return productCacheService.getCachedProduct(productId)
            .orElse(Product.builder()
                .productId(productId)
                .name("Product Temporarily Unavailable")
                .description("This product information is temporarily unavailable")
                .price(BigDecimal.ZERO)
                .isActive(false)
                .build());
    }
}
```

### Data Validation and Sanitization

#### Input Validation
```java
public class ProductCreationRequest {
    
    @NotBlank(message = "Product name is required")
    @Size(min = 3, max = 255, message = "Product name must be between 3 and 255 characters")
    @Pattern(regexp = "^[a-zA-Z0-9\\s\\-_]+$", message = "Product name contains invalid characters")
    private String name;
    
    @NotBlank(message = "Product description is required")
    @Size(min = 10, max = 5000, message = "Product description must be between 10 and 5000 characters")
    private String description;
    
    @NotNull(message = "Price is required")
    @DecimalMin(value = "0.01", message = "Price must be greater than 0")
    @DecimalMax(value = "999999.99", message = "Price must be less than 1,000,000")
    private BigDecimal price;
    
    @NotNull(message = "Category is required")
    private UUID categoryId;
    
    @Min(value = 0, message = "Inventory quantity cannot be negative")
    @Max(value = 999999, message = "Inventory quantity cannot exceed 999,999")
    private Integer inventoryQuantity;
    
    @Valid
    @Size(max = 10, message = "Maximum 10 images allowed")
    private List<ProductImageRequest> images;
}

@Component
public class InputSanitizer {
    
    private static final Pattern SQL_INJECTION_PATTERN = Pattern.compile(
        "(?i)(union|select|insert|update|delete|drop|create|alter|exec|execute|script|javascript|vbscript)"
    );
    
    private static final Pattern XSS_PATTERN = Pattern.compile(
        "(?i)<script[^>]*>.*?</script>|javascript:|vbscript:|onload=|onerror="
    );
    
    public String sanitizeInput(String input) {
        if (input == null) {
            return null;
        }
        
        // Check for SQL injection attempts
        if (SQL_INJECTION_PATTERN.matcher(input).find()) {
            throw new SQLInjectionAttemptException("Input contains potentially malicious SQL keywords");
        }
        
        // Check for XSS attempts
        if (XSS_PATTERN.matcher(input).find()) {
            throw new XSSAttemptException("Input contains potentially malicious scripts");
        }
        
        // HTML encode the input
        return HtmlUtils.htmlEscape(input);
    }
}
```

### Deployment Configuration

#### Docker Configuration
```dockerfile
# User Service Dockerfile
FROM openjdk:17-jre-slim

ARG JAR_FILE=target/*.jar
COPY ${JAR_FILE} app.jar

# Create non-root user
RUN addgroup --system spring && adduser --system spring --ingroup spring
USER spring:spring

EXPOSE 8081

ENTRYPOINT ["java", "-jar", "/app.jar"]
```

#### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  labels:
    app: user-service
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
        image: davtest12/user-service:latest
        ports:
        - containerPort: 8081
        env:
        - name: SPRING_PROFILES_ACTIVE
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
        - name: DATABASE_USERNAME
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: username
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: database-secret
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
            port: 8081
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /actuator/health/readiness
            port: 8081
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: user-service
spec:
  selector:
    app: user-service
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8081
  type: ClusterIP
```

### Performance Optimization

#### Database Optimization
```sql
-- Partitioning for large tables
CREATE TABLE orders_2024 PARTITION OF orders
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

-- Materialized views for reporting
CREATE MATERIALIZED VIEW order_summary AS
SELECT 
    DATE_TRUNC('day', created_at) as order_date,
    COUNT(*) as total_orders,
    SUM(total_amount) as total_revenue,
    AVG(total_amount) as avg_order_value
FROM orders 
WHERE status != 'CANCELLED'
GROUP BY DATE_TRUNC('day', created_at);

-- Refresh materialized view periodically
CREATE OR REPLACE FUNCTION refresh_order_summary()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY order_summary;
END;
$$ LANGUAGE plpgsql;
```

#### Connection Pool Tuning
```yaml
spring:
  datasource:
    hikari:
      # Core pool settings
      minimum-idle: 5
      maximum-pool-size: 20
      
      # Connection timeout settings
      connection-timeout: 30000
      idle-timeout: 600000
      max-lifetime: 1800000
      
      # Performance settings
      leak-detection-threshold: 60000
      
      # Pool name for monitoring
      pool-name: DavTest12-CP
      
      # Connection test query
      connection-test-query: SELECT 1
```

### Compliance and Audit

#### Audit Logging
```java
@Entity
@Table(name = "audit_logs")
public class AuditLog {
    @Id
    @GeneratedValue
    private UUID auditId;
    
    @Column(nullable = false)
    private UUID userId;
    
    @Column(nullable = false)
    private String action;
    
    @Column(nullable = false)
    private String entityType;
    
    @Column
    private String entityId;
    
    @Column(columnDefinition = "TEXT")
    private String oldValues;
    
    @Column(columnDefinition = "TEXT")
    private String newValues;
    
    @Column(nullable = false)
    private String ipAddress;
    
    @Column(nullable = false)
    private String userAgent;
    
    @Column(nullable = false)
    private LocalDateTime timestamp;
    
    @Column
    private String sessionId;
}

@Aspect
@Component
public class AuditAspect {
    
    @Autowired
    private AuditLogService auditLogService;
    
    @AfterReturning(pointcut = "@annotation(auditable)", returning = "result")
    public void auditMethod(JoinPoint joinPoint, Auditable auditable, Object result) {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication != null && authentication.isAuthenticated()) {
                UserPrincipal user = (UserPrincipal) authentication.getPrincipal();
                
                AuditLog auditLog = AuditLog.builder()
                    .userId(user.getId())
                    .action(auditable.action())
                    .entityType(auditable.entityType())
                    .entityId(extractEntityId(result))
                    .newValues(serializeObject(result))
                    .ipAddress(getClientIpAddress())
                    .userAgent(getUserAgent())
                    .timestamp(LocalDateTime.now())
                    .sessionId(getSessionId())
                    .build();
                    
                auditLogService.saveAuditLog(auditLog);
            }
        } catch (Exception e) {
            // Log error but don't fail the main operation
            logger.error("Failed to create audit log", e);
        }
    }
}
```

#### GDPR Compliance
```java
@Service
public class GdprService {
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private OrderRepository orderRepository;
    
    @Autowired
    private AuditLogRepository auditLogRepository;
    
    public PersonalDataExport exportUserData(UUID userId) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("User not found"));
            
        List<Order> orders = orderRepository.findByUserId(userId);
        List<AuditLog> auditLogs = auditLogRepository.findByUserId(userId);
        
        return PersonalDataExport.builder()
            .userData(sanitizeUserData(user))
            .orderData(sanitizeOrderData(orders))
            .auditData(sanitizeAuditData(auditLogs))
            .exportDate(LocalDateTime.now())
            .build();
    }
    
    @Transactional
    public void deleteUserData(UUID userId) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("User not found"));
            
        // Anonymize orders (keep for business records)
        List<Order> orders = orderRepository.findByUserId(userId);
        orders.forEach(order -> {
            order.setUserId(null);
            order.setShippingAddress(anonymizeAddress(order.getShippingAddress()));
            order.setBillingAddress(anonymizeAddress(order.getBillingAddress()));
        });
        orderRepository.saveAll(orders);
        
        // Delete personal data
        userRepository.delete(user);
        
        // Create deletion audit log
        AuditLog deletionLog = AuditLog.builder()
            .userId(userId)
            .action("DATA_DELETION")
            .entityType("USER")
            .entityId(userId.toString())
            .timestamp(LocalDateTime.now())
            .build();
        auditLogRepository.save(deletionLog);
    }
}
```

## Testing Strategy

### Unit Testing
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
    void shouldRegisterUserSuccessfully() {
        // Given
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .email("test@example.com")
            .password("password123")
            .firstName("John")
            .lastName("Doe")
            .build();
            
        User savedUser = User.builder()
            .userId(UUID.randomUUID())
            .email(request.getEmail())
            .firstName(request.getFirstName())
            .lastName(request.getLastName())
            .build();
            
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(false);
        when(passwordEncoder.encode(request.getPassword())).thenReturn("hashedPassword");
        when(userRepository.save(any(User.class))).thenReturn(savedUser);
        
        // When
        UserRegistrationResponse response = userService.registerUser(request);
        
        // Then
        assertThat(response.getUserId()).isEqualTo(savedUser.getUserId());
        assertThat(response.getEmail()).isEqualTo(savedUser.getEmail());
        verify(emailService).sendVerificationEmail(savedUser);
    }
    
    @Test
    void shouldThrowExceptionWhenEmailAlreadyExists() {
        // Given
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .email("existing@example.com")
            .password("password123")
            .firstName("John")
            .lastName("Doe")
            .build();
            
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(true);
        
        // When & Then
        assertThatThrownBy(() -> userService.registerUser(request))
            .isInstanceOf(EmailAlreadyExistsException.class)
            .hasMessage("Email already exists");
            
        verify(userRepository, never()).save(any(User.class));
        verify(emailService, never()).sendVerificationEmail(any(User.class));
    }
}
```

### Integration Testing
```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(locations = "classpath:application-test.properties")
@Testcontainers
class UserControllerIntegrationTest {
    
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
            .withDatabaseName("davtest12_test")
            .withUsername("test")
            .withPassword("test");
    
    @Container
    static GenericContainer<?> redis = new GenericContainer<>("redis:7")
            .withExposedPorts(6379);
    
    @Autowired
    private TestRestTemplate restTemplate;
    
    @Autowired
    private UserRepository userRepository;
    
    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.redis.host", redis::getHost);
        registry.add("spring.redis.port", () -> redis.getMappedPort(6379));
    }
    
    @Test
    void shouldRegisterUserEndToEnd() {
        // Given
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .email("integration@example.com")
            .password("SecurePass123!")
            .firstName("Integration")
            .lastName("Test")
            .build();
        
        // When
        ResponseEntity<UserRegistrationResponse> response = restTemplate.postForEntity(
            "/api/v1/users/register", request, UserRegistrationResponse.class);
        
        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().getEmail()).isEqualTo(request.getEmail());
        
        // Verify user saved in database
        Optional<User> savedUser = userRepository.findByEmail(request.getEmail());
        assertThat(savedUser).isPresent();
        assertThat(savedUser.get().getFirstName()).isEqualTo(request.getFirstName());
    }
}
```

### Performance Testing
```java
@Component
public class PerformanceTestRunner {
    
    @Autowired
    private ProductService productService;
    
    @Test
    void shouldHandleHighVolumeProductSearch() {
        // Given
        int numberOfThreads = 100;
        int requestsPerThread = 10;
        CountDownLatch latch = new CountDownLatch(numberOfThreads);
        List<Long> responseTimes = Collections.synchronizedList(new ArrayList<>());
        
        ExecutorService executor = Executors.newFixedThreadPool(numberOfThreads);
        
        // When
        for (int i = 0; i < numberOfThreads; i++) {
            executor.submit(() -> {
                try {
                    for (int j = 0; j < requestsPerThread; j++) {
                        long startTime = System.currentTimeMillis();
                        
                        ProductSearchRequest request = ProductSearchRequest.builder()
                            .query("laptop")
                            .limit(20)
                            .offset(0)
                            .build();
                            
                        productService.searchProducts(request);
                        
                        long responseTime = System.currentTimeMillis() - startTime;
                        responseTimes.add(responseTime);
                    }
                } finally {
                    latch.countDown();
                }
            });
        }
        
        // Then
        assertThat(latch.await(30, TimeUnit.SECONDS)).isTrue();
        
        double averageResponseTime = responseTimes.stream()
            .mapToLong(Long::longValue)
            .average()
            .orElse(0.0);
            
        long maxResponseTime = responseTimes.stream()
            .mapToLong(Long::longValue)
            .max()
            .orElse(0L);
            
        // Verify performance requirements
        assertThat(averageResponseTime).isLessThan(2000); // Average < 2 seconds
        assertThat(maxResponseTime).isLessThan(5000); // Max < 5 seconds
        
        executor.shutdown();
    }
}
```

## Conclusion

This Low-Level Design document provides comprehensive technical specifications for implementing the DavTest12 Online Shopping Platform. The design ensures:

- **Scalability**: Microservices architecture with horizontal scaling capabilities
- **Security**: PCI DSS compliance, data encryption, and comprehensive audit logging
- **Performance**: Caching strategies, connection pooling, and performance monitoring
- **Reliability**: Circuit breaker patterns, health checks, and error handling
- **Compliance**: GDPR compliance, data retention policies, and audit trails
- **Maintainability**: Clean code architecture, comprehensive testing, and monitoring

The implementation follows enterprise-grade practices and provides a solid foundation for a production-ready e-commerce platform.