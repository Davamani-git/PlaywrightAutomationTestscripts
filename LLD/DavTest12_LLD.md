# Online Shopping Platform - Low-Level Design Document (DavTest12)

## 1. Component Specifications

### 1.1 User Service Component

#### 1.1.1 Authentication Module

**Class: AuthenticationService**
```java
public class AuthenticationService {
    private final JwtTokenProvider tokenProvider;
    private final PasswordEncoder passwordEncoder;
    private final UserRepository userRepository;
    private final RedisTemplate<String, Object> redisTemplate;
    
    public AuthenticationResponse authenticate(LoginRequest request) {
        // Input validation
        validateLoginRequest(request);
        
        // Rate limiting check
        if (isRateLimited(request.getEmail())) {
            throw new RateLimitExceededException("Too many login attempts");
        }
        
        // User lookup and password verification
        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new InvalidCredentialsException("Invalid credentials"));
            
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            recordFailedAttempt(request.getEmail());
            throw new InvalidCredentialsException("Invalid credentials");
        }
        
        // Generate tokens
        String accessToken = tokenProvider.generateAccessToken(user);
        String refreshToken = tokenProvider.generateRefreshToken(user);
        
        // Store refresh token in Redis
        redisTemplate.opsForValue().set(
            "refresh_token:" + user.getUserId(), 
            refreshToken, 
            Duration.ofDays(30)
        );
        
        return AuthenticationResponse.builder()
            .accessToken(accessToken)
            .refreshToken(refreshToken)
            .expiresIn(tokenProvider.getAccessTokenExpiration())
            .build();
    }
    
    private void validateLoginRequest(LoginRequest request) {
        if (!EmailValidator.isValid(request.getEmail())) {
            throw new ValidationException("Invalid email format");
        }
        if (request.getPassword().length() < 8) {
            throw new ValidationException("Password too short");
        }
    }
}
```

**Database Schema: users table**
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    address JSONB,
    role_id UUID REFERENCES roles(role_id),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT valid_phone CHECK (phone ~* '^\+?[1-9]\d{1,14}$')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_users_active ON users(is_active);
```

#### 1.1.2 Authorization Module

**Class: AuthorizationService**
```java
@Component
public class AuthorizationService {
    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final RedisTemplate<String, Object> redisTemplate;
    
    public boolean hasPermission(UUID userId, String resource, String action) {
        // Check cache first
        String cacheKey = String.format("permissions:%s:%s:%s", userId, resource, action);
        Boolean cached = (Boolean) redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            return cached;
        }
        
        // Query database
        List<Permission> permissions = permissionRepository.findByUserIdAndResource(userId, resource);
        boolean hasPermission = permissions.stream()
            .anyMatch(p -> p.getAction().equals(action) || p.getAction().equals("*"));
            
        // Cache result for 5 minutes
        redisTemplate.opsForValue().set(cacheKey, hasPermission, Duration.ofMinutes(5));
        
        return hasPermission;
    }
    
    @PreAuthorize("@authorizationService.hasPermission(authentication.principal.userId, 'PRODUCT', 'CREATE')")
    public void checkProductCreationPermission() {
        // Method-level authorization annotation
    }
}
```

### 1.2 Product Service Component

#### 1.2.1 Product Catalog Module

**Class: ProductService**
```java
@Service
@Transactional
public class ProductService {
    private final ProductRepository productRepository;
    private final ElasticsearchTemplate elasticsearchTemplate;
    private final RedisTemplate<String, Object> redisTemplate;
    private final ImageStorageService imageStorageService;
    
    public ProductResponse createProduct(CreateProductRequest request, UUID sellerId) {
        // Input validation
        validateProductRequest(request);
        
        // Check seller permissions
        if (!authorizationService.hasPermission(sellerId, "PRODUCT", "CREATE")) {
            throw new UnauthorizedException("Insufficient permissions");
        }
        
        // Create product entity
        Product product = Product.builder()
            .productId(UUID.randomUUID())
            .name(sanitizeInput(request.getName()))
            .description(sanitizeInput(request.getDescription()))
            .price(request.getPrice())
            .sellerId(sellerId)
            .categoryId(request.getCategoryId())
            .inventory(request.getInventory())
            .isActive(true)
            .createdAt(Instant.now())
            .build();
            
        // Save to database
        product = productRepository.save(product);
        
        // Process and store images
        if (request.getImages() != null && !request.getImages().isEmpty()) {
            List<String> imageUrls = processProductImages(product.getProductId(), request.getImages());
            product.setImages(imageUrls);
            productRepository.save(product);
        }
        
        // Index in Elasticsearch for search
        indexProductForSearch(product);
        
        // Invalidate related caches
        invalidateProductCaches(product.getCategoryId());
        
        return ProductResponse.from(product);
    }
    
    private void indexProductForSearch(Product product) {
        ProductSearchDocument searchDoc = ProductSearchDocument.builder()
            .productId(product.getProductId().toString())
            .name(product.getName())
            .description(product.getDescription())
            .price(product.getPrice())
            .categoryId(product.getCategoryId().toString())
            .sellerId(product.getSellerId().toString())
            .inventory(product.getInventory())
            .isActive(product.getIsActive())
            .createdAt(product.getCreatedAt())
            .build();
            
        elasticsearchTemplate.save(searchDoc);
    }
}
```

**Database Schema: products table**
```sql
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    seller_id UUID NOT NULL REFERENCES users(user_id),
    category_id UUID NOT NULL REFERENCES categories(category_id),
    inventory INTEGER NOT NULL DEFAULT 0 CHECK (inventory >= 0),
    images JSONB DEFAULT '[]'::jsonb,
    attributes JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_name CHECK (length(trim(name)) >= 3),
    CONSTRAINT valid_description CHECK (length(trim(description)) >= 10)
);

CREATE INDEX idx_products_seller_id ON products(seller_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_inventory ON products(inventory);
CREATE INDEX idx_products_created_at ON products(created_at);

-- Full-text search index
CREATE INDEX idx_products_search ON products USING gin(to_tsvector('english', name || ' ' || description));
```

#### 1.2.2 Search Module

**Class: ProductSearchService**
```java
@Service
public class ProductSearchService {
    private final ElasticsearchTemplate elasticsearchTemplate;
    private final RedisTemplate<String, Object> redisTemplate;
    
    public SearchResponse<ProductSearchDocument> searchProducts(ProductSearchRequest request) {
        // Build Elasticsearch query
        BoolQuery.Builder queryBuilder = QueryBuilders.bool();
        
        // Text search
        if (StringUtils.hasText(request.getQuery())) {
            queryBuilder.must(QueryBuilders.multiMatch(m -> m
                .fields("name^2", "description")
                .query(request.getQuery())
                .type(TextQueryType.BestFields)
                .fuzziness("AUTO")
            ));
        }
        
        // Category filter
        if (request.getCategoryId() != null) {
            queryBuilder.filter(QueryBuilders.term(t -> t
                .field("categoryId")
                .value(request.getCategoryId().toString())
            ));
        }
        
        // Price range filter
        if (request.getMinPrice() != null || request.getMaxPrice() != null) {
            RangeQuery.Builder rangeBuilder = QueryBuilders.range().field("price");
            if (request.getMinPrice() != null) {
                rangeBuilder.gte(JsonData.of(request.getMinPrice()));
            }
            if (request.getMaxPrice() != null) {
                rangeBuilder.lte(JsonData.of(request.getMaxPrice()));
            }
            queryBuilder.filter(rangeBuilder.build()._toQuery());
        }
        
        // Active products only
        queryBuilder.filter(QueryBuilders.term(t -> t
            .field("isActive")
            .value(true)
        ));
        
        // Build search request
        SearchRequest searchRequest = SearchRequest.of(s -> s
            .index("products")
            .query(queryBuilder.build()._toQuery())
            .sort(buildSortOptions(request.getSortBy(), request.getSortOrder()))
            .from(request.getOffset())
            .size(request.getLimit())
            .aggregations(buildAggregations())
        );
        
        // Execute search
        SearchResponse<ProductSearchDocument> response = elasticsearchTemplate.search(searchRequest, ProductSearchDocument.class);
        
        return response;
    }
    
    private Map<String, Aggregation> buildAggregations() {
        return Map.of(
            "categories", Aggregation.of(a -> a
                .terms(t -> t.field("categoryId").size(50))
            ),
            "price_ranges", Aggregation.of(a -> a
                .range(r -> r
                    .field("price")
                    .ranges(
                        RangeAggregationRange.of(range -> range.to(JsonData.of(25))),
                        RangeAggregationRange.of(range -> range.from(JsonData.of(25)).to(JsonData.of(50))),
                        RangeAggregationRange.of(range -> range.from(JsonData.of(50)).to(JsonData.of(100))),
                        RangeAggregationRange.of(range -> range.from(JsonData.of(100)))
                    )
                )
            )
        );
    }
}
```

### 1.3 Order Service Component

#### 1.3.1 Shopping Cart Module

**Class: ShoppingCartService**
```java
@Service
public class ShoppingCartService {
    private final RedisTemplate<String, Object> redisTemplate;
    private final ProductService productService;
    private final ObjectMapper objectMapper;
    
    private static final String CART_KEY_PREFIX = "cart:";
    private static final Duration CART_EXPIRATION = Duration.ofDays(30);
    
    public CartResponse addToCart(UUID userId, AddToCartRequest request) {
        // Validate product exists and is available
        ProductResponse product = productService.getProduct(request.getProductId());
        if (!product.getIsActive() || product.getInventory() < request.getQuantity()) {
            throw new ProductNotAvailableException("Product not available");
        }
        
        // Get current cart
        Cart cart = getCart(userId);
        
        // Check if item already exists in cart
        Optional<CartItem> existingItem = cart.getItems().stream()
            .filter(item -> item.getProductId().equals(request.getProductId()))
            .findFirst();
            
        if (existingItem.isPresent()) {
            // Update quantity
            CartItem item = existingItem.get();
            int newQuantity = item.getQuantity() + request.getQuantity();
            
            // Check inventory
            if (newQuantity > product.getInventory()) {
                throw new InsufficientInventoryException("Not enough inventory");
            }
            
            item.setQuantity(newQuantity);
            item.setTotalPrice(product.getPrice().multiply(BigDecimal.valueOf(newQuantity)));
        } else {
            // Add new item
            CartItem newItem = CartItem.builder()
                .productId(request.getProductId())
                .productName(product.getName())
                .unitPrice(product.getPrice())
                .quantity(request.getQuantity())
                .totalPrice(product.getPrice().multiply(BigDecimal.valueOf(request.getQuantity())))
                .addedAt(Instant.now())
                .build();
                
            cart.getItems().add(newItem);
        }
        
        // Update cart totals
        updateCartTotals(cart);
        
        // Save cart to Redis
        saveCart(userId, cart);
        
        return CartResponse.from(cart);
    }
    
    private Cart getCart(UUID userId) {
        String cartKey = CART_KEY_PREFIX + userId.toString();
        String cartJson = (String) redisTemplate.opsForValue().get(cartKey);
        
        if (cartJson == null) {
            return Cart.builder()
                .userId(userId)
                .items(new ArrayList<>())
                .totalAmount(BigDecimal.ZERO)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();
        }
        
        try {
            return objectMapper.readValue(cartJson, Cart.class);
        } catch (JsonProcessingException e) {
            throw new CartSerializationException("Failed to deserialize cart", e);
        }
    }
    
    private void saveCart(UUID userId, Cart cart) {
        String cartKey = CART_KEY_PREFIX + userId.toString();
        cart.setUpdatedAt(Instant.now());
        
        try {
            String cartJson = objectMapper.writeValueAsString(cart);
            redisTemplate.opsForValue().set(cartKey, cartJson, CART_EXPIRATION);
        } catch (JsonProcessingException e) {
            throw new CartSerializationException("Failed to serialize cart", e);
        }
    }
}
```

#### 1.3.2 Order Processing Module

**Class: OrderService**
```java
@Service
@Transactional
public class OrderService {
    private final OrderRepository orderRepository;
    private final ProductService productService;
    private final PaymentService paymentService;
    private final InventoryService inventoryService;
    private final NotificationService notificationService;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    
    public OrderResponse createOrder(UUID userId, CreateOrderRequest request) {
        // Validate cart and inventory
        Cart cart = shoppingCartService.getCart(userId);
        if (cart.getItems().isEmpty()) {
            throw new EmptyCartException("Cart is empty");
        }
        
        // Reserve inventory
        List<InventoryReservation> reservations = reserveInventory(cart.getItems());
        
        try {
            // Create order entity
            Order order = Order.builder()
                .orderId(UUID.randomUUID())
                .userId(userId)
                .status(OrderStatus.PENDING)
                .totalAmount(cart.getTotalAmount())
                .shippingAddress(request.getShippingAddress())
                .createdAt(Instant.now())
                .build();
                
            order = orderRepository.save(order);
            
            // Create order items
            List<OrderItem> orderItems = cart.getItems().stream()
                .map(cartItem -> OrderItem.builder()
                    .itemId(UUID.randomUUID())
                    .orderId(order.getOrderId())
                    .productId(cartItem.getProductId())
                    .quantity(cartItem.getQuantity())
                    .unitPrice(cartItem.getUnitPrice())
                    .totalPrice(cartItem.getTotalPrice())
                    .build())
                .collect(Collectors.toList());
                
            orderItemRepository.saveAll(orderItems);
            order.setItems(orderItems);
            
            // Process payment
            PaymentResponse paymentResponse = paymentService.processPayment(
                PaymentRequest.builder()
                    .orderId(order.getOrderId())
                    .amount(order.getTotalAmount())
                    .paymentMethod(request.getPaymentMethod())
                    .build()
            );
            
            // Update order status based on payment result
            if (paymentResponse.getStatus() == PaymentStatus.SUCCESS) {
                order.setStatus(OrderStatus.CONFIRMED);
                order.setPaymentId(paymentResponse.getPaymentId());
                
                // Confirm inventory reservations
                inventoryService.confirmReservations(reservations);
                
                // Clear cart
                shoppingCartService.clearCart(userId);
                
                // Send confirmation notification
                publishOrderEvent(OrderEvent.builder()
                    .eventType(OrderEventType.ORDER_CONFIRMED)
                    .orderId(order.getOrderId())
                    .userId(userId)
                    .timestamp(Instant.now())
                    .build());
                    
            } else {
                order.setStatus(OrderStatus.PAYMENT_FAILED);
                // Release inventory reservations
                inventoryService.releaseReservations(reservations);
            }
            
            orderRepository.save(order);
            
            return OrderResponse.from(order);
            
        } catch (Exception e) {
            // Release reservations on any error
            inventoryService.releaseReservations(reservations);
            throw e;
        }
    }
    
    private void publishOrderEvent(OrderEvent event) {
        kafkaTemplate.send("order-events", event.getOrderId().toString(), event);
    }
}
```

**Database Schema: orders table**
```sql
CREATE TYPE order_status AS ENUM (
    'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 
    'DELIVERED', 'CANCELLED', 'PAYMENT_FAILED', 'REFUNDED'
);

CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    status order_status NOT NULL DEFAULT 'PENDING',
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    shipping_address JSONB NOT NULL,
    payment_id UUID,
    tracking_number VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP
);

CREATE TABLE order_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(10,2) NOT NULL CHECK (total_price >= 0)
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
```

### 1.4 Payment Service Component

#### 1.4.1 Payment Gateway Integration

**Class: PaymentGatewayService**
```java
@Service
public class PaymentGatewayService {
    private final Map<PaymentMethod, PaymentGateway> gateways;
    private final PaymentRepository paymentRepository;
    private final FraudDetectionService fraudDetectionService;
    
    public PaymentResponse processPayment(PaymentRequest request) {
        // Fraud detection check
        FraudAssessment fraudAssessment = fraudDetectionService.assessTransaction(request);
        if (fraudAssessment.getRiskScore() > 0.8) {
            return PaymentResponse.builder()
                .status(PaymentStatus.DECLINED)
                .declineReason("High fraud risk detected")
                .build();
        }
        
        // Get appropriate gateway
        PaymentGateway gateway = gateways.get(request.getPaymentMethod());
        if (gateway == null) {
            throw new UnsupportedPaymentMethodException("Payment method not supported");
        }
        
        // Create payment record
        Payment payment = Payment.builder()
            .paymentId(UUID.randomUUID())
            .orderId(request.getOrderId())
            .amount(request.getAmount())
            .method(request.getPaymentMethod())
            .status(PaymentStatus.PROCESSING)
            .createdAt(Instant.now())
            .build();
            
        payment = paymentRepository.save(payment);
        
        try {
            // Process payment through gateway
            GatewayResponse gatewayResponse = gateway.processPayment(
                GatewayRequest.builder()
                    .paymentId(payment.getPaymentId())
                    .amount(request.getAmount())
                    .currency("USD")
                    .paymentDetails(request.getPaymentDetails())
                    .build()
            );
            
            // Update payment status
            payment.setStatus(gatewayResponse.isSuccess() ? PaymentStatus.SUCCESS : PaymentStatus.FAILED);
            payment.setTransactionId(gatewayResponse.getTransactionId());
            payment.setGatewayResponse(gatewayResponse.getResponseData());
            payment.setProcessedAt(Instant.now());
            
            if (!gatewayResponse.isSuccess()) {
                payment.setFailureReason(gatewayResponse.getErrorMessage());
            }
            
            paymentRepository.save(payment);
            
            return PaymentResponse.builder()
                .paymentId(payment.getPaymentId())
                .status(payment.getStatus())
                .transactionId(payment.getTransactionId())
                .build();
                
        } catch (Exception e) {
            // Update payment status on error
            payment.setStatus(PaymentStatus.ERROR);
            payment.setFailureReason(e.getMessage());
            paymentRepository.save(payment);
            
            throw new PaymentProcessingException("Payment processing failed", e);
        }
    }
}
```

## 2. Data Flow Diagrams

### 2.1 User Registration Flow

```
User Registration Flow:

[User] --1--> [API Gateway] --2--> [User Service]
                                        |
                                        3
                                        v
                                   [Database]
                                        |
                                        4
                                        v
                                [Email Service] <--5-- [Message Queue]
                                        |
                                        6
                                        v
                                [External Email Provider]

Steps:
1. User submits registration form
2. API Gateway routes to User Service
3. User Service validates and saves user data
4. User Service publishes email verification event
5. Message Queue delivers event to Email Service
6. Email Service sends verification email
```

### 2.2 Product Search Flow

```
Product Search Flow:

[User] --1--> [API Gateway] --2--> [Product Service]
                                        |
                                        3
                                        v
                                   [Redis Cache] --4--> [Cache Hit?]
                                        |                    |
                                        |                    | No
                                        | Yes                v
                                        |              [Elasticsearch]
                                        |                    |
                                        |                    5
                                        |                    v
                                        6 <------------- [Search Results]
                                        |
                                        7
                                        v
                                   [Response to User]

Steps:
1. User enters search query
2. API Gateway routes to Product Service
3. Product Service checks Redis cache
4. Cache miss triggers Elasticsearch query
5. Elasticsearch returns search results
6. Results cached in Redis
7. Response sent to user
```

### 2.3 Order Processing Flow

```
Order Processing Flow:

[User] --1--> [Order Service] --2--> [Inventory Service]
                 |                          |
                 |                          3 (Reserve)
                 |                          v
                 |                    [Product Database]
                 |
                 4
                 v
           [Payment Service] --5--> [Payment Gateway]
                 |                          |
                 |                          6
                 |                          v
                 7 <-------------- [Payment Response]
                 |
                 8
                 v
           [Order Database] --9--> [Message Queue]
                                        |
                                       10
                                        v
                              [Notification Service]
                                        |
                                       11
                                        v
                                [Email/SMS Service]

Steps:
1. User initiates checkout
2. Order Service requests inventory reservation
3. Inventory Service reserves items
4. Order Service initiates payment
5. Payment Service calls external gateway
6. Gateway processes payment
7. Payment result returned
8. Order status updated in database
9. Order event published to message queue
10. Notification Service receives event
11. Confirmation sent to user
```

## 3. Sequence Diagrams

### 3.1 User Authentication Sequence

```
User Authentication Sequence:

User          API Gateway    Auth Service    Database    Redis       Email Service
 |                |              |            |          |              |
 |--Login Req---->|              |            |          |              |
 |                |--Validate--->|            |          |              |
 |                |              |--Query---->|          |              |
 |                |              |<--User-----|          |              |
 |                |              |--Verify Password      |              |
 |                |              |--Generate Tokens      |              |
 |                |              |--Store Refresh------->|              |
 |                |<--Tokens-----|            |          |              |
 |<--Auth Resp----|              |            |          |              |
 |                |              |            |          |              |
 |--API Call----->|              |            |          |              |
 |                |--Verify----->|            |          |              |
 |                |              |--Check Redis--------->|              |
 |                |              |<--Token Valid---------|              |
 |                |<--Authorized-|            |          |              |
 |<--API Resp-----|              |            |          |              |
```

### 3.2 Product Creation Sequence

```
Product Creation Sequence:

Seller        API Gateway    Product Service    Database    Elasticsearch    Image Service
 |                |              |               |              |               |
 |--Create Req--->|              |               |              |               |
 |                |--Authorize-->|               |              |               |
 |                |              |--Validate-----|              |               |
 |                |              |--Save-------->|              |               |
 |                |              |<--Product-----|              |               |
 |                |              |--Process Images------------->|               |
 |                |              |<--Image URLs-----------------|               |
 |                |              |--Update------>|              |               |
 |                |              |--Index--------|------------->|               |
 |                |<--Success----|               |              |               |
 |<--Product------|              |               |              |               |
```

## 4. Implementation Details

### 4.1 Security Implementation

#### 4.1.1 Input Validation

**Class: InputValidator**
```java
@Component
public class InputValidator {
    private static final Pattern EMAIL_PATTERN = 
        Pattern.compile("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");
    private static final Pattern PHONE_PATTERN = 
        Pattern.compile("^\\+?[1-9]\\d{1,14}$");
    
    public void validateUserRegistration(UserRegistrationRequest request) {
        List<ValidationError> errors = new ArrayList<>();
        
        // Email validation
        if (!EMAIL_PATTERN.matcher(request.getEmail()).matches()) {
            errors.add(new ValidationError("email", "Invalid email format"));
        }
        
        // Password validation
        if (!isValidPassword(request.getPassword())) {
            errors.add(new ValidationError("password", "Password does not meet requirements"));
        }
        
        // Name validation
        if (!isValidName(request.getFirstName())) {
            errors.add(new ValidationError("firstName", "Invalid first name"));
        }
        
        if (!isValidName(request.getLastName())) {
            errors.add(new ValidationError("lastName", "Invalid last name"));
        }
        
        // Phone validation (optional)
        if (request.getPhone() != null && !PHONE_PATTERN.matcher(request.getPhone()).matches()) {
            errors.add(new ValidationError("phone", "Invalid phone number format"));
        }
        
        if (!errors.isEmpty()) {
            throw new ValidationException("Validation failed", errors);
        }
    }
    
    private boolean isValidPassword(String password) {
        return password != null &&
               password.length() >= 8 &&
               password.length() <= 128 &&
               password.matches(".*[A-Z].*") &&  // At least one uppercase
               password.matches(".*[a-z].*") &&  // At least one lowercase
               password.matches(".*\\d.*") &&     // At least one digit
               password.matches(".*[!@#$%^&*()].*"); // At least one special char
    }
    
    private boolean isValidName(String name) {
        return name != null &&
               name.trim().length() >= 2 &&
               name.trim().length() <= 50 &&
               name.matches("^[a-zA-Z\\s'-]+$");
    }
}
```

#### 4.1.2 Output Sanitization

**Class: OutputSanitizer**
```java
@Component
public class OutputSanitizer {
    private final PolicyFactory htmlSanitizer;
    
    public OutputSanitizer() {
        this.htmlSanitizer = new HtmlPolicyBuilder()
            .allowElements("b", "i", "u", "em", "strong", "p", "br")
            .allowAttributes("class").onElements("p")
            .toFactory();
    }
    
    public String sanitizeHtml(String input) {
        if (input == null) return null;
        return htmlSanitizer.sanitize(input);
    }
    
    public String escapeJson(String input) {
        if (input == null) return null;
        return input.replace("\\", "\\\\")
                   .replace("\"", "\\\"")
                   .replace("\n", "\\n")
                   .replace("\r", "\\r")
                   .replace("\t", "\\t");
    }
    
    public ProductResponse sanitizeProductResponse(ProductResponse response) {
        return ProductResponse.builder()
            .productId(response.getProductId())
            .name(sanitizeHtml(response.getName()))
            .description(sanitizeHtml(response.getDescription()))
            .price(response.getPrice())
            .sellerId(response.getSellerId())
            .categoryId(response.getCategoryId())
            .inventory(response.getInventory())
            .images(response.getImages())
            .isActive(response.getIsActive())
            .createdAt(response.getCreatedAt())
            .build();
    }
}
```

### 4.2 Caching Strategy

#### 4.2.1 Redis Configuration

**Configuration: RedisConfig**
```java
@Configuration
@EnableCaching
public class RedisConfig {
    
    @Bean
    public RedisConnectionFactory redisConnectionFactory() {
        LettuceConnectionFactory factory = new LettuceConnectionFactory(
            new RedisStandaloneConfiguration("redis-cluster.internal", 6379)
        );
        factory.setValidateConnection(true);
        return factory;
    }
    
    @Bean
    public RedisTemplate<String, Object> redisTemplate() {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(redisConnectionFactory());
        
        // Use Jackson for JSON serialization
        Jackson2JsonRedisSerializer<Object> serializer = new Jackson2JsonRedisSerializer<>(Object.class);
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.ANY);
        objectMapper.activateDefaultTyping(LaissezFaireSubTypeValidator.instance, ObjectMapper.DefaultTyping.NON_FINAL);
        serializer.setObjectMapper(objectMapper);
        
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(serializer);
        template.setHashKeySerializer(new StringRedisSerializer());
        template.setHashValueSerializer(serializer);
        
        template.afterPropertiesSet();
        return template;
    }
    
    @Bean
    public CacheManager cacheManager() {
        RedisCacheManager.Builder builder = RedisCacheManager
            .RedisCacheManagerBuilder
            .fromConnectionFactory(redisConnectionFactory())
            .cacheDefaults(cacheConfiguration(Duration.ofMinutes(10)));
            
        // Configure specific cache durations
        Map<String, RedisCacheConfiguration> cacheConfigurations = new HashMap<>();
        cacheConfigurations.put("products", cacheConfiguration(Duration.ofMinutes(30)));
        cacheConfigurations.put("categories", cacheConfiguration(Duration.ofHours(1)));
        cacheConfigurations.put("users", cacheConfiguration(Duration.ofMinutes(15)));
        cacheConfigurations.put("permissions", cacheConfiguration(Duration.ofMinutes(5)));
        
        return builder.withInitialCacheConfigurations(cacheConfigurations).build();
    }
    
    private RedisCacheConfiguration cacheConfiguration(Duration ttl) {
        return RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(ttl)
            .disableCachingNullValues()
            .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(new GenericJackson2JsonRedisSerializer()));
    }
}
```

### 4.3 Database Optimization

#### 4.3.1 Connection Pooling

**Configuration: DatabaseConfig**
```java
@Configuration
public class DatabaseConfig {
    
    @Bean
    @Primary
    public DataSource primaryDataSource() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:postgresql://primary-db.internal:5432/shopping_platform");
        config.setUsername("${db.username}");
        config.setPassword("${db.password}");
        
        // Connection pool settings
        config.setMaximumPoolSize(20);
        config.setMinimumIdle(5);
        config.setConnectionTimeout(30000);
        config.setIdleTimeout(600000);
        config.setMaxLifetime(1800000);
        config.setLeakDetectionThreshold(60000);
        
        // Performance settings
        config.addDataSourceProperty("cachePrepStmts", "true");
        config.addDataSourceProperty("prepStmtCacheSize", "250");
        config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
        config.addDataSourceProperty("useServerPrepStmts", "true");
        config.addDataSourceProperty("rewriteBatchedStatements", "true");
        
        return new HikariDataSource(config);
    }
    
    @Bean
    public DataSource readOnlyDataSource() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:postgresql://readonly-db.internal:5432/shopping_platform");
        config.setUsername("${db.readonly.username}");
        config.setPassword("${db.readonly.password}");
        config.setMaximumPoolSize(15);
        config.setReadOnly(true);
        
        return new HikariDataSource(config);
    }
}
```

### 4.4 Message Queue Implementation

#### 4.4.1 Kafka Configuration

**Configuration: KafkaConfig**
```java
@Configuration
@EnableKafka
public class KafkaConfig {
    
    @Bean
    public ProducerFactory<String, Object> producerFactory() {
        Map<String, Object> configProps = new HashMap<>();
        configProps.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka-cluster.internal:9092");
        configProps.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        configProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        
        // Performance and reliability settings
        configProps.put(ProducerConfig.ACKS_CONFIG, "all");
        configProps.put(ProducerConfig.RETRIES_CONFIG, 3);
        configProps.put(ProducerConfig.BATCH_SIZE_CONFIG, 16384);
        configProps.put(ProducerConfig.LINGER_MS_CONFIG, 1);
        configProps.put(ProducerConfig.BUFFER_MEMORY_CONFIG, 33554432);
        configProps.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        
        return new DefaultKafkaProducerFactory<>(configProps);
    }
    
    @Bean
    public KafkaTemplate<String, Object> kafkaTemplate() {
        return new KafkaTemplate<>(producerFactory());
    }
    
    @Bean
    public ConsumerFactory<String, Object> consumerFactory() {
        Map<String, Object> props = new HashMap<>();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka-cluster.internal:9092");
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "shopping-platform");
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class);
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        props.put(JsonDeserializer.TRUSTED_PACKAGES, "com.shoppingplatform.events");
        
        return new DefaultKafkaConsumerFactory<>(props);
    }
    
    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, Object> kafkaListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<String, Object> factory = new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory());
        factory.setConcurrency(3);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        return factory;
    }
}
```

#### 4.4.2 Event Handlers

**Class: OrderEventHandler**
```java
@Component
@Slf4j
public class OrderEventHandler {
    private final NotificationService notificationService;
    private final InventoryService inventoryService;
    private final AnalyticsService analyticsService;
    
    @KafkaListener(topics = "order-events", groupId = "notification-service")
    public void handleOrderEvent(OrderEvent event, Acknowledgment ack) {
        try {
            log.info("Processing order event: {} for order: {}", event.getEventType(), event.getOrderId());
            
            switch (event.getEventType()) {
                case ORDER_CONFIRMED:
                    handleOrderConfirmed(event);
                    break;
                case ORDER_SHIPPED:
                    handleOrderShipped(event);
                    break;
                case ORDER_DELIVERED:
                    handleOrderDelivered(event);
                    break;
                case ORDER_CANCELLED:
                    handleOrderCancelled(event);
                    break;
                default:
                    log.warn("Unknown order event type: {}", event.getEventType());
            }
            
            // Track analytics
            analyticsService.trackOrderEvent(event);
            
            ack.acknowledge();
            
        } catch (Exception e) {
            log.error("Error processing order event: {}", event, e);
            // Don't acknowledge - message will be retried
        }
    }
    
    private void handleOrderConfirmed(OrderEvent event) {
        // Send confirmation email
        notificationService.sendOrderConfirmation(event.getUserId(), event.getOrderId());
        
        // Send SMS notification if enabled
        notificationService.sendSMSNotification(event.getUserId(), 
            "Your order #" + event.getOrderId() + " has been confirmed!");
    }
    
    private void handleOrderShipped(OrderEvent event) {
        // Send shipping notification
        notificationService.sendShippingNotification(event.getUserId(), event.getOrderId(), event.getTrackingNumber());
    }
    
    private void handleOrderDelivered(OrderEvent event) {
        // Send delivery confirmation
        notificationService.sendDeliveryConfirmation(event.getUserId(), event.getOrderId());
        
        // Request review
        notificationService.sendReviewRequest(event.getUserId(), event.getOrderId());
    }
    
    private void handleOrderCancelled(OrderEvent event) {
        // Send cancellation notification
        notificationService.sendCancellationNotification(event.getUserId(), event.getOrderId());
        
        // Release inventory
        inventoryService.releaseOrderInventory(event.getOrderId());
    }
}
```

### 4.5 Monitoring and Logging

#### 4.5.1 Application Metrics

**Configuration: MetricsConfig**
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
    
    @Bean
    public CountedAspect countedAspect(MeterRegistry registry) {
        return new CountedAspect(registry);
    }
}
```

**Class: CustomMetrics**
```java
@Component
public class CustomMetrics {
    private final Counter orderCreatedCounter;
    private final Counter paymentProcessedCounter;
    private final Timer orderProcessingTimer;
    private final Gauge activeUsersGauge;
    
    public CustomMetrics(MeterRegistry meterRegistry) {
        this.orderCreatedCounter = Counter.builder("orders.created")
            .description("Number of orders created")
            .register(meterRegistry);
            
        this.paymentProcessedCounter = Counter.builder("payments.processed")
            .description("Number of payments processed")
            .tag("status", "success")
            .register(meterRegistry);
            
        this.orderProcessingTimer = Timer.builder("order.processing.time")
            .description("Order processing time")
            .register(meterRegistry);
            
        this.activeUsersGauge = Gauge.builder("users.active")
            .description("Number of active users")
            .register(meterRegistry, this, CustomMetrics::getActiveUserCount);
    }
    
    public void incrementOrderCreated() {
        orderCreatedCounter.increment();
    }
    
    public void recordOrderProcessingTime(Duration duration) {
        orderProcessingTimer.record(duration);
    }
    
    private double getActiveUserCount() {
        // Implementation to get active user count
        return 0.0;
    }
}
```

## 5. Error Handling and Resilience Patterns

### 5.1 Circuit Breaker Implementation

**Class: PaymentServiceCircuitBreaker**
```java
@Component
public class PaymentServiceCircuitBreaker {
    private final CircuitBreaker circuitBreaker;
    private final PaymentGateway paymentGateway;
    
    public PaymentServiceCircuitBreaker(PaymentGateway paymentGateway) {
        this.paymentGateway = paymentGateway;
        this.circuitBreaker = CircuitBreaker.ofDefaults("paymentService");
        
        // Configure circuit breaker
        circuitBreaker.getEventPublisher()
            .onStateTransition(event -> 
                log.info("Payment service circuit breaker state transition: {}", event));
    }
    
    public PaymentResponse processPayment(PaymentRequest request) {
        Supplier<PaymentResponse> decoratedSupplier = CircuitBreaker
            .decorateSupplier(circuitBreaker, () -> paymentGateway.processPayment(request));
            
        return Try.ofSupplier(decoratedSupplier)
            .recover(throwable -> {
                log.error("Payment processing failed, circuit breaker activated", throwable);
                return PaymentResponse.builder()
                    .status(PaymentStatus.FAILED)
                    .errorMessage("Payment service temporarily unavailable")
                    .build();
            })
            .get();
    }
}
```

### 5.2 Retry Logic with Exponential Backoff

**Class: RetryableService**
```java
@Component
public class RetryableService {
    private final Retry retry;
    
    public RetryableService() {
        this.retry = Retry.of("externalService", RetryConfig.custom()
            .maxAttempts(3)
            .waitDuration(Duration.ofSeconds(1))
            .intervalFunction(IntervalFunction.ofExponentialBackoff(Duration.ofSeconds(1), 2.0))
            .retryOnException(throwable -> 
                throwable instanceof ConnectException || 
                throwable instanceof SocketTimeoutException)
            .build());
            
        retry.getEventPublisher()
            .onRetry(event -> log.warn("Retry attempt #{} for {}", 
                event.getNumberOfRetryAttempts(), event.getName()));
    }
    
    public <T> T executeWithRetry(Supplier<T> operation) {
        Supplier<T> decoratedSupplier = Retry.decorateSupplier(retry, operation);
        return decoratedSupplier.get();
    }
}
```

### 5.3 Bulkhead Pattern

**Configuration: ThreadPoolConfig**
```java
@Configuration
@EnableAsync
public class ThreadPoolConfig implements AsyncConfigurer {
    
    @Bean("orderProcessingExecutor")
    public Executor orderProcessingExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(20);
        executor.setQueueCapacity(500);
        executor.setThreadNamePrefix("OrderProcessing-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }
    
    @Bean("paymentProcessingExecutor")
    public Executor paymentProcessingExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);
        executor.setMaxPoolSize(10);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("PaymentProcessing-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }
    
    @Bean("notificationExecutor")
    public Executor notificationExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(3);
        executor.setMaxPoolSize(5);
        executor.setQueueCapacity(1000);
        executor.setThreadNamePrefix("Notification-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.DiscardOldestPolicy());
        executor.initialize();
        return executor;
    }
}
```

## 6. Performance Optimization

### 6.1 Database Query Optimization

**Repository: OptimizedProductRepository**
```java
@Repository
public interface OptimizedProductRepository extends JpaRepository<Product, UUID> {
    
    @Query(value = """
        SELECT p.*, c.name as category_name, u.first_name as seller_name
        FROM products p
        JOIN categories c ON p.category_id = c.category_id
        JOIN users u ON p.seller_id = u.user_id
        WHERE p.is_active = true
        AND (:categoryId IS NULL OR p.category_id = :categoryId)
        AND (:minPrice IS NULL OR p.price >= :minPrice)
        AND (:maxPrice IS NULL OR p.price <= :maxPrice)
        AND (:searchTerm IS NULL OR 
             to_tsvector('english', p.name || ' ' || p.description) @@ plainto_tsquery('english', :searchTerm))
        ORDER BY 
            CASE WHEN :sortBy = 'price' AND :sortOrder = 'ASC' THEN p.price END ASC,
            CASE WHEN :sortBy = 'price' AND :sortOrder = 'DESC' THEN p.price END DESC,
            CASE WHEN :sortBy = 'created_at' AND :sortOrder = 'DESC' THEN p.created_at END DESC,
            p.created_at DESC
        LIMIT :limit OFFSET :offset
        """, nativeQuery = true)
    List<ProductProjection> findProductsOptimized(
        @Param("categoryId") UUID categoryId,
        @Param("minPrice") BigDecimal minPrice,
        @Param("maxPrice") BigDecimal maxPrice,
        @Param("searchTerm") String searchTerm,
        @Param("sortBy") String sortBy,
        @Param("sortOrder") String sortOrder,
        @Param("limit") int limit,
        @Param("offset") int offset
    );
    
    @Query("SELECT p FROM Product p WHERE p.sellerId = :sellerId AND p.isActive = true")
    @EntityGraph(attributePaths = {"category", "reviews"})
    List<Product> findBySellerIdWithDetails(@Param("sellerId") UUID sellerId);
    
    @Modifying
    @Query("UPDATE Product p SET p.inventory = p.inventory - :quantity WHERE p.productId = :productId AND p.inventory >= :quantity")
    int decreaseInventory(@Param("productId") UUID productId, @Param("quantity") int quantity);
}
```

### 6.2 Caching Strategies

**Service: CachedProductService**
```java
@Service
public class CachedProductService {
    private final ProductRepository productRepository;
    private final RedisTemplate<String, Object> redisTemplate;
    
    @Cacheable(value = "products", key = "#productId", unless = "#result == null")
    public ProductResponse getProduct(UUID productId) {
        Product product = productRepository.findById(productId)
            .orElseThrow(() -> new ProductNotFoundException("Product not found"));
        return ProductResponse.from(product);
    }
    
    @Cacheable(value = "product-search", key = "#request.hashCode()", unless = "#result.isEmpty()")
    public List<ProductResponse> searchProducts(ProductSearchRequest request) {
        return productRepository.findProductsOptimized(
            request.getCategoryId(),
            request.getMinPrice(),
            request.getMaxPrice(),
            request.getSearchTerm(),
            request.getSortBy(),
            request.getSortOrder(),
            request.getLimit(),
            request.getOffset()
        ).stream()
        .map(ProductResponse::from)
        .collect(Collectors.toList());
    }
    
    @CacheEvict(value = {"products", "product-search"}, allEntries = true)
    public ProductResponse updateProduct(UUID productId, UpdateProductRequest request) {
        // Update logic
        Product updated = productRepository.save(product);
        return ProductResponse.from(updated);
    }
    
    // Cache warming strategy
    @Scheduled(fixedRate = 300000) // Every 5 minutes
    public void warmProductCache() {
        List<UUID> popularProductIds = getPopularProductIds();
        popularProductIds.parallelStream()
            .forEach(this::getProduct);
    }
}
```

## 7. Deployment Configuration

### 7.1 Kubernetes Deployment

**File: user-service-deployment.yaml**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  labels:
    app: user-service
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
        version: v1
    spec:
      containers:
      - name: user-service
        image: shopping-platform/user-service:1.0.0
        ports:
        - containerPort: 8080
        env:
        - name: SPRING_PROFILES_ACTIVE
          value: "production"
        - name: DB_HOST
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: host
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: password
        - name: REDIS_HOST
          valueFrom:
            configMapKeyRef:
              name: redis-config
              key: host
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /actuator/health/liveness
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /actuator/health/readiness
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
        volumeMounts:
        - name: config-volume
          mountPath: /app/config
      volumes:
      - name: config-volume
        configMap:
          name: user-service-config
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
    targetPort: 8080
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: user-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: user-service
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 7.2 Docker Configuration

**File: Dockerfile**
```dockerfile
# Multi-stage build
FROM openjdk:17-jdk-slim as builder

WORKDIR /app
COPY pom.xml .
COPY src ./src

# Copy Maven wrapper
COPY .mvn ./.mvn
COPY mvnw .

# Build application
RUN chmod +x mvnw && ./mvnw clean package -DskipTests

# Production stage
FROM openjdk:17-jre-slim

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Install security updates
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy application jar
COPY --from=builder /app/target/user-service-*.jar app.jar

# Change ownership to non-root user
RUN chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1

# JVM optimization
ENV JAVA_OPTS="-XX:+UseG1GC -XX:+UseStringDeduplication -XX:+OptimizeStringConcat"

EXPOSE 8080

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

## 8. Testing Strategy

### 8.1 Unit Tests

**Class: UserServiceTest**
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
    void shouldCreateUserSuccessfully() {
        // Given
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .email("test@example.com")
            .password("SecurePass123!")
            .firstName("John")
            .lastName("Doe")
            .build();
            
        User savedUser = User.builder()
            .userId(UUID.randomUUID())
            .email(request.getEmail())
            .firstName(request.getFirstName())
            .lastName(request.getLastName())
            .isActive(true)
            .build();
            
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(false);
        when(passwordEncoder.encode(request.getPassword())).thenReturn("hashedPassword");
        when(userRepository.save(any(User.class))).thenReturn(savedUser);
        
        // When
        UserResponse response = userService.registerUser(request);
        
        // Then
        assertThat(response).isNotNull();
        assertThat(response.getEmail()).isEqualTo(request.getEmail());
        assertThat(response.getFirstName()).isEqualTo(request.getFirstName());
        assertThat(response.getLastName()).isEqualTo(request.getLastName());
        
        verify(userRepository).existsByEmail(request.getEmail());
        verify(passwordEncoder).encode(request.getPassword());
        verify(userRepository).save(any(User.class));
    }
    
    @Test
    void shouldThrowExceptionWhenEmailAlreadyExists() {
        // Given
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .email("existing@example.com")
            .password("SecurePass123!")
            .firstName("John")
            .lastName("Doe")
            .build();
            
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(true);
        
        // When & Then
        assertThatThrownBy(() -> userService.registerUser(request))
            .isInstanceOf(EmailAlreadyExistsException.class)
            .hasMessage("Email already registered");
            
        verify(userRepository).existsByEmail(request.getEmail());
        verify(userRepository, never()).save(any(User.class));
    }
}
```

### 8.2 Integration Tests

**Class: UserControllerIntegrationTest**
```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(locations = "classpath:application-test.properties")
@Transactional
class UserControllerIntegrationTest {
    
    @Autowired
    private TestRestTemplate restTemplate;
    
    @Autowired
    private UserRepository userRepository;
    
    @Test
    void shouldRegisterUserSuccessfully() {
        // Given
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .email("integration@test.com")
            .password("SecurePass123!")
            .firstName("Integration")
            .lastName("Test")
            .build();
            
        // When
        ResponseEntity<UserResponse> response = restTemplate.postForEntity(
            "/api/v1/users/register", 
            request, 
            UserResponse.class
        );
        
        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getEmail()).isEqualTo(request.getEmail());
        
        // Verify database
        Optional<User> savedUser = userRepository.findByEmail(request.getEmail());
        assertThat(savedUser).isPresent();
        assertThat(savedUser.get().getFirstName()).isEqualTo(request.getFirstName());
    }
    
    @Test
    void shouldReturn400ForInvalidEmail() {
        // Given
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .email("invalid-email")
            .password("SecurePass123!")
            .firstName("Test")
            .lastName("User")
            .build();
            
        // When
        ResponseEntity<ErrorResponse> response = restTemplate.postForEntity(
            "/api/v1/users/register", 
            request, 
            ErrorResponse.class
        );
        
        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().getMessage()).contains("Invalid email format");
    }
}
```

### 8.3 Performance Tests

**Class: ProductSearchPerformanceTest**
```java
@SpringBootTest
@TestPropertySource(locations = "classpath:application-test.properties")
class ProductSearchPerformanceTest {
    
    @Autowired
    private ProductService productService;
    
    @Test
    void shouldMeetSearchPerformanceRequirements() {
        // Given
        ProductSearchRequest request = ProductSearchRequest.builder()
            .query("laptop")
            .limit(20)
            .offset(0)
            .build();
            
        // Warm up
        for (int i = 0; i < 10; i++) {
            productService.searchProducts(request);
        }
        
        // When
        long startTime = System.currentTimeMillis();
        List<ProductResponse> results = productService.searchProducts(request);
        long endTime = System.currentTimeMillis();
        
        // Then
        long responseTime = endTime - startTime;
        assertThat(responseTime).isLessThan(1000); // Should be under 1 second
        assertThat(results).isNotEmpty();
        assertThat(results.size()).isLessThanOrEqualTo(20);
    }
}
```

This comprehensive Low-Level Design document provides detailed implementation specifications for the Online Shopping Platform, including component specifications, data flows, sequence diagrams, security implementations, performance optimizations, deployment configurations, and testing strategies. The design ensures scalability, security, and maintainability while meeting all functional and non-functional requirements.