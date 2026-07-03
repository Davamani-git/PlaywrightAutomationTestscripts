# Low-Level Design Document for DavTest0703 E-Commerce Platform

## 1. Component Specifications

### 1.1 User Service Component

#### Class Structure
```java
@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID userId;
    
    @Column(unique = true, nullable = false)
    @Email
    private String email;
    
    @Column(nullable = false)
    private String passwordHash;
    
    @Column(nullable = false)
    private String firstName;
    
    @Column(nullable = false)
    private String lastName;
    
    @Pattern(regexp = "^\\+?[1-9]\\d{1,14}$")
    private String phone;
    
    @Enumerated(EnumType.STRING)
    private UserRole role;
    
    @Column(nullable = false)
    private Boolean isActive = true;
    
    @CreationTimestamp
    private LocalDateTime createdAt;
    
    @UpdateTimestamp
    private LocalDateTime updatedAt;
    
    // Constructors, getters, setters
}

@RestController
@RequestMapping("/api/v1/users")
@Validated
public class UserController {
    
    @Autowired
    private UserService userService;
    
    @PostMapping("/register")
    @RateLimited(requests = 5, window = "1m")
    public ResponseEntity<UserResponse> registerUser(
            @Valid @RequestBody UserRegistrationRequest request) {
        
        // Input validation
        validateRegistrationRequest(request);
        
        // Business logic
        User user = userService.registerUser(request);
        
        // Response mapping
        UserResponse response = mapToResponse(user);
        
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
    
    @PostMapping("/login")
    @RateLimited(requests = 10, window = "1m")
    public ResponseEntity<AuthenticationResponse> authenticateUser(
            @Valid @RequestBody LoginRequest request) {
        
        // Authentication logic
        AuthenticationResponse response = userService.authenticateUser(request);
        
        return ResponseEntity.ok(response);
    }
}

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
    
    public User registerUser(UserRegistrationRequest request) {
        // Check if user exists
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new UserAlreadyExistsException("User with email already exists");
        }
        
        // Create user entity
        User user = new User();
        user.setEmail(request.getEmail());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setFirstName(request.getFirstName());
        user.setLastName(request.getLastName());
        user.setPhone(request.getPhone());
        user.setRole(UserRole.CONSUMER);
        
        // Save user
        User savedUser = userRepository.save(user);
        
        // Send welcome notification
        notificationService.sendWelcomeNotification(savedUser);
        
        return savedUser;
    }
    
    public AuthenticationResponse authenticateUser(LoginRequest request) {
        // Validate credentials
        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new InvalidCredentialsException("Invalid credentials"));
        
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new InvalidCredentialsException("Invalid credentials");
        }
        
        if (!user.getIsActive()) {
            throw new AccountDisabledException("Account is disabled");
        }
        
        // Generate JWT token
        String token = jwtTokenProvider.generateToken(user);
        
        return new AuthenticationResponse(token, user.getRole());
    }
}
```

### 1.2 Product Service Component

#### Class Structure
```java
@Entity
@Table(name = "products")
public class Product {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID productId;
    
    @Column(nullable = false)
    @Size(min = 1, max = 255)
    private String name;
    
    @Column(columnDefinition = "TEXT")
    private String description;
    
    @Column(nullable = false, precision = 10, scale = 2)
    @DecimalMin(value = "0.01")
    private BigDecimal price;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "seller_id", nullable = false)
    private User seller;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;
    
    @Column(nullable = false)
    @Min(0)
    private Integer inventory;
    
    @Column(nullable = false)
    private Boolean isActive = true;
    
    @CreationTimestamp
    private LocalDateTime createdAt;
    
    @UpdateTimestamp
    private LocalDateTime updatedAt;
    
    // Constructors, getters, setters
}

@RestController
@RequestMapping("/api/v1/products")
public class ProductController {
    
    @Autowired
    private ProductService productService;
    
    @GetMapping("/search")
    @Cacheable(value = "productSearch", key = "#query + '_' + #page + '_' + #size")
    public ResponseEntity<PagedResponse<ProductResponse>> searchProducts(
            @RequestParam String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice) {
        
        SearchCriteria criteria = SearchCriteria.builder()
            .query(query)
            .category(category)
            .minPrice(minPrice)
            .maxPrice(maxPrice)
            .page(page)
            .size(size)
            .build();
        
        PagedResponse<ProductResponse> response = productService.searchProducts(criteria);
        
        return ResponseEntity.ok(response);
    }
    
    @PostMapping
    @PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
    public ResponseEntity<ProductResponse> createProduct(
            @Valid @RequestBody ProductCreationRequest request,
            Authentication authentication) {
        
        Product product = productService.createProduct(request, authentication.getName());
        ProductResponse response = mapToResponse(product);
        
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}

@Service
@Transactional
public class ProductService {
    
    @Autowired
    private ProductRepository productRepository;
    
    @Autowired
    private ElasticsearchTemplate elasticsearchTemplate;
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    public PagedResponse<ProductResponse> searchProducts(SearchCriteria criteria) {
        // Check cache first
        String cacheKey = generateCacheKey(criteria);
        PagedResponse<ProductResponse> cachedResult = 
            (PagedResponse<ProductResponse>) redisTemplate.opsForValue().get(cacheKey);
        
        if (cachedResult != null) {
            return cachedResult;
        }
        
        // Build Elasticsearch query
        BoolQueryBuilder queryBuilder = QueryBuilders.boolQuery();
        
        if (StringUtils.hasText(criteria.getQuery())) {
            queryBuilder.must(QueryBuilders.multiMatchQuery(criteria.getQuery())
                .field("name", 2.0f)
                .field("description", 1.0f)
                .type(MultiMatchQueryBuilder.Type.BEST_FIELDS));
        }
        
        if (StringUtils.hasText(criteria.getCategory())) {
            queryBuilder.filter(QueryBuilders.termQuery("category.name", criteria.getCategory()));
        }
        
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
            .withSort(SortBuilders.scoreSort().order(SortOrder.DESC))
            .build();
        
        SearchHits<ProductDocument> searchHits = elasticsearchTemplate.search(searchQuery, ProductDocument.class);
        
        // Convert to response
        List<ProductResponse> products = searchHits.stream()
            .map(hit -> mapToResponse(hit.getContent()))
            .collect(Collectors.toList());
        
        PagedResponse<ProductResponse> result = new PagedResponse<>(
            products, 
            criteria.getPage(), 
            criteria.getSize(), 
            searchHits.getTotalHits()
        );
        
        // Cache result
        redisTemplate.opsForValue().set(cacheKey, result, Duration.ofMinutes(5));
        
        return result;
    }
}
```

### 1.3 Order Service Component

#### Class Structure
```java
@Entity
@Table(name = "orders")
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID orderId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
    
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal totalAmount;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderStatus status;
    
    @Embedded
    @AttributeOverrides({
        @AttributeOverride(name = "street", column = @Column(name = "shipping_street")),
        @AttributeOverride(name = "city", column = @Column(name = "shipping_city")),
        @AttributeOverride(name = "state", column = @Column(name = "shipping_state")),
        @AttributeOverride(name = "zipCode", column = @Column(name = "shipping_zip")),
        @AttributeOverride(name = "country", column = @Column(name = "shipping_country"))
    })
    private Address shippingAddress;
    
    @Embedded
    @AttributeOverrides({
        @AttributeOverride(name = "street", column = @Column(name = "billing_street")),
        @AttributeOverride(name = "city", column = @Column(name = "billing_city")),
        @AttributeOverride(name = "state", column = @Column(name = "billing_state")),
        @AttributeOverride(name = "zipCode", column = @Column(name = "billing_zip")),
        @AttributeOverride(name = "country", column = @Column(name = "billing_country"))
    })
    private Address billingAddress;
    
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<OrderItem> orderItems = new ArrayList<>();
    
    @OneToOne(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private Payment payment;
    
    @CreationTimestamp
    private LocalDateTime createdAt;
    
    @UpdateTimestamp
    private LocalDateTime updatedAt;
    
    // Constructors, getters, setters
}

@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {
    
    @Autowired
    private OrderService orderService;
    
    @PostMapping
    @PreAuthorize("hasRole('CONSUMER') or hasRole('ADMIN')")
    public ResponseEntity<OrderResponse> createOrder(
            @Valid @RequestBody OrderCreationRequest request,
            Authentication authentication) {
        
        Order order = orderService.createOrder(request, authentication.getName());
        OrderResponse response = mapToResponse(order);
        
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
    
    @GetMapping("/{orderId}")
    @PreAuthorize("@orderService.isOrderOwner(#orderId, authentication.name) or hasRole('ADMIN')")
    public ResponseEntity<OrderResponse> getOrder(
            @PathVariable UUID orderId,
            Authentication authentication) {
        
        Order order = orderService.getOrderById(orderId);
        OrderResponse response = mapToResponse(order);
        
        return ResponseEntity.ok(response);
    }
}

@Service
@Transactional
public class OrderService {
    
    @Autowired
    private OrderRepository orderRepository;
    
    @Autowired
    private ShoppingCartService shoppingCartService;
    
    @Autowired
    private PaymentService paymentService;
    
    @Autowired
    private InventoryService inventoryService;
    
    @Autowired
    private NotificationService notificationService;
    
    @Autowired
    private ApplicationEventPublisher eventPublisher;
    
    public Order createOrder(OrderCreationRequest request, String userEmail) {
        // Get user's shopping cart
        ShoppingCart cart = shoppingCartService.getCartByUserEmail(userEmail);
        
        if (cart.getCartItems().isEmpty()) {
            throw new EmptyCartException("Cannot create order from empty cart");
        }
        
        // Reserve inventory
        List<InventoryReservation> reservations = reserveInventory(cart.getCartItems());
        
        try {
            // Create order
            Order order = new Order();
            order.setUser(cart.getUser());
            order.setStatus(OrderStatus.PENDING);
            order.setShippingAddress(request.getShippingAddress());
            order.setBillingAddress(request.getBillingAddress());
            
            // Create order items
            BigDecimal totalAmount = BigDecimal.ZERO;
            for (CartItem cartItem : cart.getCartItems()) {
                OrderItem orderItem = new OrderItem();
                orderItem.setOrder(order);
                orderItem.setProduct(cartItem.getProduct());
                orderItem.setQuantity(cartItem.getQuantity());
                orderItem.setUnitPrice(cartItem.getProduct().getPrice());
                orderItem.setTotalPrice(cartItem.getProduct().getPrice().multiply(BigDecimal.valueOf(cartItem.getQuantity())));
                
                order.getOrderItems().add(orderItem);
                totalAmount = totalAmount.add(orderItem.getTotalPrice());
            }
            
            order.setTotalAmount(totalAmount);
            
            // Save order
            Order savedOrder = orderRepository.save(order);
            
            // Process payment
            Payment payment = paymentService.processPayment(
                savedOrder, 
                request.getPaymentMethod(), 
                request.getPaymentDetails()
            );
            
            savedOrder.setPayment(payment);
            
            // Clear shopping cart
            shoppingCartService.clearCart(cart.getCartId());
            
            // Publish order created event
            eventPublisher.publishEvent(new OrderCreatedEvent(savedOrder));
            
            // Send confirmation notification
            notificationService.sendOrderConfirmation(savedOrder);
            
            return savedOrder;
            
        } catch (Exception e) {
            // Release inventory reservations on failure
            inventoryService.releaseReservations(reservations);
            throw e;
        }
    }
}
```

### 1.4 Payment Service Component

#### Class Structure
```java
@Entity
@Table(name = "payments")
public class Payment {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID paymentId;
    
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;
    
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal amount;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentMethod method;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentStatus status;
    
    @Column(unique = true)
    private String transactionId;
    
    private LocalDateTime processedAt;
    
    @Column(columnDefinition = "JSON")
    private String gatewayResponse;
    
    @CreationTimestamp
    private LocalDateTime createdAt;
    
    @UpdateTimestamp
    private LocalDateTime updatedAt;
    
    // Constructors, getters, setters
}

@Service
@Transactional
public class PaymentService {
    
    @Autowired
    private PaymentRepository paymentRepository;
    
    @Autowired
    private StripePaymentGateway stripeGateway;
    
    @Autowired
    private PayPalPaymentGateway paypalGateway;
    
    @Autowired
    private FraudDetectionService fraudDetectionService;
    
    @Autowired
    private ApplicationEventPublisher eventPublisher;
    
    public Payment processPayment(Order order, PaymentMethod method, PaymentDetails details) {
        // Fraud detection
        FraudScore fraudScore = fraudDetectionService.assessRisk(order, details);
        if (fraudScore.getScore() > 0.8) {
            throw new FraudDetectedException("Payment blocked due to fraud risk");
        }
        
        // Create payment record
        Payment payment = new Payment();
        payment.setOrder(order);
        payment.setAmount(order.getTotalAmount());
        payment.setMethod(method);
        payment.setStatus(PaymentStatus.PENDING);
        
        Payment savedPayment = paymentRepository.save(payment);
        
        try {
            // Process payment through gateway
            PaymentGateway gateway = getPaymentGateway(method);
            PaymentResult result = gateway.processPayment(
                savedPayment.getPaymentId().toString(),
                order.getTotalAmount(),
                details
            );
            
            // Update payment status
            savedPayment.setStatus(result.getStatus());
            savedPayment.setTransactionId(result.getTransactionId());
            savedPayment.setGatewayResponse(result.getGatewayResponse());
            savedPayment.setProcessedAt(LocalDateTime.now());
            
            savedPayment = paymentRepository.save(savedPayment);
            
            // Publish payment event
            if (result.getStatus() == PaymentStatus.COMPLETED) {
                eventPublisher.publishEvent(new PaymentCompletedEvent(savedPayment));
            } else {
                eventPublisher.publishEvent(new PaymentFailedEvent(savedPayment));
            }
            
            return savedPayment;
            
        } catch (PaymentGatewayException e) {
            savedPayment.setStatus(PaymentStatus.FAILED);
            savedPayment.setGatewayResponse(e.getMessage());
            paymentRepository.save(savedPayment);
            
            throw new PaymentProcessingException("Payment processing failed", e);
        }
    }
}
```

## 2. Data Flow Diagrams

### 2.1 User Registration Flow
```
Client Application
        |
        | POST /api/v1/users/register
        |
        v
   API Gateway
        |
        | Rate Limiting Check
        | JWT Validation (if required)
        |
        v
  User Controller
        |
        | Input Validation
        | @Valid annotation
        |
        v
   User Service
        |
        | Business Logic Validation
        | Check if user exists
        | Password encoding
        |
        v
  User Repository
        |
        | Database Insert
        |
        v
   PostgreSQL Database
        |
        | User record created
        |
        v
Notification Service
        |
        | Send welcome email
        |
        v
   Email Provider (SendGrid)
        |
        | Email delivered
        |
        v
   Client Application
        |
        | Success response
```

### 2.2 Product Search Flow
```
Client Application
        |
        | GET /api/v1/products/search?query=laptop
        |
        v
   API Gateway
        |
        | Rate Limiting
        | Authentication
        |
        v
 Product Controller
        |
        | Parameter validation
        | Cache check
        |
        v
   Redis Cache
        |
        | Cache miss
        |
        v
  Product Service
        |
        | Build search query
        | Apply filters
        |
        v
  Elasticsearch
        |
        | Execute search
        | Return results
        |
        v
  Product Service
        |
        | Map to response
        | Cache results
        |
        v
   Redis Cache
        |
        | Store for 5 minutes
        |
        v
   Client Application
        |
        | Search results displayed
```

### 2.3 Order Processing Flow
```
Client Application
        |
        | POST /api/v1/orders
        |
        v
   API Gateway
        |
        | Authentication
        | Authorization
        |
        v
  Order Controller
        |
        | Input validation
        | Security checks
        |
        v
   Order Service
        |
        | Get shopping cart
        | Validate cart items
        |
        v
 Inventory Service
        |
        | Reserve inventory
        | Check availability
        |
        v
   Order Service
        |
        | Create order record
        | Calculate totals
        |
        v
  Payment Service
        |
        | Fraud detection
        | Process payment
        |
        v
 Payment Gateway (Stripe)
        |
        | Process transaction
        | Return result
        |
        v
  Payment Service
        |
        | Update payment status
        | Store transaction ID
        |
        v
   Order Service
        |
        | Update order status
        | Clear shopping cart
        |
        v
Notification Service
        |
        | Send order confirmation
        |
        v
   Client Application
        |
        | Order confirmation
```

## 3. Sequence Diagrams

### 3.1 User Authentication Sequence
```
Client -> API Gateway: POST /api/v1/users/login {email, password}
API Gateway -> User Controller: Forward request
User Controller -> User Service: authenticateUser(request)
User Service -> User Repository: findByEmail(email)
User Repository -> Database: SELECT * FROM users WHERE email = ?
Database -> User Repository: User record
User Repository -> User Service: User entity
User Service -> Password Encoder: matches(password, hash)
Password Encoder -> User Service: boolean result
User Service -> JWT Provider: generateToken(user)
JWT Provider -> User Service: JWT token
User Service -> User Controller: AuthenticationResponse
User Controller -> API Gateway: HTTP 200 + token
API Gateway -> Client: Authentication successful
```

### 3.2 Product Creation Sequence
```
Seller -> API Gateway: POST /api/v1/products {productData}
API Gateway -> Security Filter: Validate JWT token
Security Filter -> API Gateway: User authenticated
API Gateway -> Product Controller: Forward request
Product Controller -> Authorization: @PreAuthorize check
Authorization -> Product Controller: Access granted
Product Controller -> Product Service: createProduct(request, userEmail)
Product Service -> User Repository: findByEmail(userEmail)
User Repository -> Product Service: Seller entity
Product Service -> Product Repository: save(product)
Product Repository -> Database: INSERT INTO products
Database -> Product Repository: Product saved
Product Repository -> Product Service: Product entity
Product Service -> Elasticsearch: indexProduct(product)
Elasticsearch -> Product Service: Index updated
Product Service -> Product Controller: Product entity
Product Controller -> API Gateway: HTTP 201 + product
API Gateway -> Seller: Product created successfully
```

### 3.3 Order Fulfillment Sequence
```
Customer -> API Gateway: POST /api/v1/orders {orderData}
API Gateway -> Order Controller: Forward request
Order Controller -> Order Service: createOrder(request, userEmail)
Order Service -> Cart Service: getCartByUserEmail(userEmail)
Cart Service -> Order Service: ShoppingCart
Order Service -> Inventory Service: reserveInventory(cartItems)
Inventory Service -> Database: UPDATE products SET inventory = inventory - quantity
Database -> Inventory Service: Inventory reserved
Inventory Service -> Order Service: Reservation confirmed
Order Service -> Order Repository: save(order)
Order Repository -> Database: INSERT INTO orders
Database -> Order Repository: Order saved
Order Repository -> Order Service: Order entity
Order Service -> Payment Service: processPayment(order, paymentDetails)
Payment Service -> Fraud Service: assessRisk(order, details)
Fraud Service -> Payment Service: FraudScore
Payment Service -> Payment Gateway: processPayment(amount, details)
Payment Gateway -> Payment Service: PaymentResult
Payment Service -> Order Service: Payment completed
Order Service -> Event Publisher: publishEvent(OrderCreatedEvent)
Event Publisher -> Notification Service: Handle order created
Notification Service -> Email Service: Send confirmation
Email Service -> Customer: Order confirmation email
Order Service -> Order Controller: Order entity
Order Controller -> Customer: HTTP 201 + order details
```

## 4. Implementation Details

### 4.1 Database Schema Implementation

#### PostgreSQL Schema
```sql
-- Users table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(20) NOT NULL CHECK (role IN ('CONSUMER', 'SELLER', 'ADMIN')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(category_id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price > 0),
    seller_id UUID NOT NULL REFERENCES users(user_id),
    category_id UUID NOT NULL REFERENCES categories(category_id),
    inventory INTEGER NOT NULL CHECK (inventory >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Shopping carts table
CREATE TABLE shopping_carts (
    cart_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Cart items table
CREATE TABLE cart_items (
    cart_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES shopping_carts(cart_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cart_id, product_id)
);

-- Orders table
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount > 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED')),
    shipping_street VARCHAR(255) NOT NULL,
    shipping_city VARCHAR(100) NOT NULL,
    shipping_state VARCHAR(100) NOT NULL,
    shipping_zip VARCHAR(20) NOT NULL,
    shipping_country VARCHAR(100) NOT NULL,
    billing_street VARCHAR(255) NOT NULL,
    billing_city VARCHAR(100) NOT NULL,
    billing_state VARCHAR(100) NOT NULL,
    billing_zip VARCHAR(20) NOT NULL,
    billing_country VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Order items table
CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price > 0),
    total_price DECIMAL(10,2) NOT NULL CHECK (total_price > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payments table
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    method VARCHAR(20) NOT NULL CHECK (method IN ('CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL', 'BANK_TRANSFER')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED')),
    transaction_id VARCHAR(255) UNIQUE,
    processed_at TIMESTAMP WITH TIME ZONE,
    gateway_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_products_seller_id ON products(seller_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_name ON products USING gin(to_tsvector('english', name));
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_transaction_id ON payments(transaction_id);
```

### 4.2 Security Implementation

#### JWT Token Configuration
```java
@Configuration
@EnableWebSecurity
@EnableGlobalMethodSecurity(prePostEnabled = true)
public class SecurityConfig {
    
    @Autowired
    private JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint;
    
    @Autowired
    private JwtRequestFilter jwtRequestFilter;
    
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }
    
    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration authConfig) throws Exception {
        return authConfig.getAuthenticationManager();
    }
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf().disable()
            .authorizeHttpRequests(authz -> authz
                .requestMatchers("/api/v1/users/register", "/api/v1/users/login").permitAll()
                .requestMatchers("/api/v1/products/search").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/products/**").permitAll()
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/v1/products").hasAnyRole("SELLER", "ADMIN")
                .anyRequest().authenticated()
            )
            .exceptionHandling().authenticationEntryPoint(jwtAuthenticationEntryPoint)
            .and()
            .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            .and()
            .headers().frameOptions().deny()
            .contentTypeOptions().and()
            .httpStrictTransportSecurity(hstsConfig -> hstsConfig
                .maxAgeInSeconds(31536000)
                .includeSubdomains(true)
            );
        
        http.addFilterBefore(jwtRequestFilter, UsernamePasswordAuthenticationFilter.class);
        
        return http.build();
    }
}

@Component
public class JwtTokenProvider {
    
    @Value("${jwt.secret}")
    private String jwtSecret;
    
    @Value("${jwt.expiration}")
    private int jwtExpirationInMs;
    
    private final Algorithm algorithm;
    
    public JwtTokenProvider() {
        this.algorithm = Algorithm.HMAC512(jwtSecret);
    }
    
    public String generateToken(User user) {
        Date expiryDate = new Date(System.currentTimeMillis() + jwtExpirationInMs);
        
        return JWT.create()
            .withSubject(user.getEmail())
            .withClaim("userId", user.getUserId().toString())
            .withClaim("role", user.getRole().name())
            .withIssuedAt(new Date())
            .withExpiresAt(expiryDate)
            .sign(algorithm);
    }
    
    public boolean validateToken(String token) {
        try {
            JWTVerifier verifier = JWT.require(algorithm).build();
            verifier.verify(token);
            return true;
        } catch (JWTVerificationException e) {
            return false;
        }
    }
    
    public String getEmailFromToken(String token) {
        DecodedJWT decodedJWT = JWT.decode(token);
        return decodedJWT.getSubject();
    }
}
```

#### Input Validation Implementation
```java
@Component
public class InputSanitizer {
    
    private final Policy policy;
    
    public InputSanitizer() {
        this.policy = new PolicyFactory().sanitize();
    }
    
    public String sanitizeHtml(String input) {
        if (input == null) {
            return null;
        }
        return policy.sanitize(input);
    }
    
    public String sanitizeForSql(String input) {
        if (input == null) {
            return null;
        }
        // Remove SQL injection patterns
        return input.replaceAll("[';\"\\\\]", "");
    }
}

@ControllerAdvice
public class ValidationExceptionHandler {
    
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationExceptions(
            MethodArgumentNotValidException ex) {
        
        Map<String, String> errors = new HashMap<>();
        ex.getBindingResult().getAllErrors().forEach((error) -> {
            String fieldName = ((FieldError) error).getField();
            String errorMessage = error.getDefaultMessage();
            errors.put(fieldName, errorMessage);
        });
        
        ErrorResponse errorResponse = new ErrorResponse(
            "VALIDATION_FAILED",
            "Input validation failed",
            errors
        );
        
        return ResponseEntity.badRequest().body(errorResponse);
    }
}
```

### 4.3 Caching Implementation

#### Redis Configuration
```java
@Configuration
@EnableCaching
public class RedisConfig {
    
    @Bean
    public RedisConnectionFactory redisConnectionFactory() {
        LettuceConnectionFactory factory = new LettuceConnectionFactory(
            new RedisStandaloneConfiguration("localhost", 6379)
        );
        factory.setValidateConnection(true);
        return factory;
    }
    
    @Bean
    public RedisTemplate<String, Object> redisTemplate() {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(redisConnectionFactory());
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(new GenericJackson2JsonRedisSerializer());
        template.setHashKeySerializer(new StringRedisSerializer());
        template.setHashValueSerializer(new GenericJackson2JsonRedisSerializer());
        return template;
    }
    
    @Bean
    public CacheManager cacheManager() {
        RedisCacheManager.Builder builder = RedisCacheManager
            .RedisCacheManagerBuilder
            .fromConnectionFactory(redisConnectionFactory())
            .cacheDefaults(cacheConfiguration(Duration.ofMinutes(5)));
        
        return builder.build();
    }
    
    private RedisCacheConfiguration cacheConfiguration(Duration ttl) {
        return RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(ttl)
            .serializeKeysWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()));
    }
}
```

### 4.4 Error Handling Implementation

#### Circuit Breaker Pattern
```java
@Component
public class PaymentGatewayService {
    
    private final CircuitBreaker circuitBreaker;
    
    public PaymentGatewayService() {
        this.circuitBreaker = CircuitBreaker.ofDefaults("paymentGateway");
        circuitBreaker.getEventPublisher()
            .onStateTransition(event -> 
                log.info("Circuit breaker state transition: {}", event));
    }
    
    public PaymentResult processPayment(PaymentRequest request) {
        Supplier<PaymentResult> decoratedSupplier = CircuitBreaker
            .decorateSupplier(circuitBreaker, () -> {
                return callPaymentGateway(request);
            });
        
        return Try.ofSupplier(decoratedSupplier)
            .recover(throwable -> {
                log.error("Payment processing failed", throwable);
                return PaymentResult.failed("Payment service temporarily unavailable");
            })
            .get();
    }
}

@Component
public class RetryableService {
    
    @Retryable(
        value = {TransientException.class},
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2)
    )
    public String callExternalService(String request) {
        // External service call that might fail transiently
        return externalServiceClient.call(request);
    }
    
    @Recover
    public String recover(TransientException ex, String request) {
        log.error("All retry attempts failed for request: {}", request, ex);
        throw new ServiceUnavailableException("External service is currently unavailable");
    }
}
```

### 4.5 Monitoring and Logging Implementation

#### Application Monitoring
```java
@Configuration
public class MonitoringConfig {
    
    @Bean
    public MeterRegistry meterRegistry() {
        return new PrometheusMeterRegistry(PrometheusConfig.DEFAULT);
    }
    
    @Bean
    public TimedAspect timedAspect(MeterRegistry registry) {
        return new TimedAspect(registry);
    }
}

@RestController
public class MetricsController {
    
    @Autowired
    private MeterRegistry meterRegistry;
    
    @GetMapping("/actuator/prometheus")
    public String prometheus() {
        return ((PrometheusMeterRegistry) meterRegistry).scrape();
    }
}

@Component
public class BusinessMetrics {
    
    private final Counter orderCounter;
    private final Timer paymentTimer;
    private final Gauge activeUsersGauge;
    
    public BusinessMetrics(MeterRegistry meterRegistry) {
        this.orderCounter = Counter.builder("orders.created")
            .description("Number of orders created")
            .register(meterRegistry);
        
        this.paymentTimer = Timer.builder("payments.processing.time")
            .description("Payment processing time")
            .register(meterRegistry);
        
        this.activeUsersGauge = Gauge.builder("users.active")
            .description("Number of active users")
            .register(meterRegistry, this, BusinessMetrics::getActiveUserCount);
    }
    
    public void incrementOrderCount() {
        orderCounter.increment();
    }
    
    public void recordPaymentTime(Duration duration) {
        paymentTimer.record(duration);
    }
    
    private double getActiveUserCount() {
        // Implementation to get active user count
        return 0.0;
    }
}
```

#### Structured Logging
```java
@Component
public class AuditLogger {
    
    private static final Logger auditLog = LoggerFactory.getLogger("AUDIT");
    
    public void logUserAction(String userId, String action, String resource, String details) {
        MDC.put("userId", userId);
        MDC.put("action", action);
        MDC.put("resource", resource);
        MDC.put("timestamp", Instant.now().toString());
        
        auditLog.info("User action: {}", details);
        
        MDC.clear();
    }
    
    public void logSecurityEvent(String eventType, String details, String ipAddress) {
        MDC.put("eventType", eventType);
        MDC.put("ipAddress", ipAddress);
        MDC.put("timestamp", Instant.now().toString());
        
        auditLog.warn("Security event: {}", details);
        
        MDC.clear();
    }
}
```

This comprehensive Low-Level Design document provides detailed implementation specifications for the DavTest0703 e-commerce platform, including component specifications, data flows, sequence diagrams, and implementation details for security, caching, error handling, and monitoring.