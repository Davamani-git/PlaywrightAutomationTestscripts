# Low-Level Design Document for DavTest3 Online Shopping Platform

## Table of Contents
1. [Component Specifications](#component-specifications)
2. [Data Flow Diagrams](#data-flow-diagrams)
3. [Sequence Diagrams](#sequence-diagrams)
4. [Implementation Details](#implementation-details)
5. [Database Design](#database-design)
6. [API Specifications](#api-specifications)
7. [Security Implementation](#security-implementation)
8. [Performance Optimization](#performance-optimization)

## Component Specifications

### 1. User Service Component

#### Class Structure
```java
@RestController
@RequestMapping("/api/v1/users")
public class UserController {
    
    @Autowired
    private UserService userService;
    
    @PostMapping("/register")
    public ResponseEntity<UserResponse> registerUser(@Valid @RequestBody UserRegistrationRequest request) {
        // Implementation
    }
    
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        // Implementation
    }
    
    @GetMapping("/profile")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<UserProfile> getUserProfile(Authentication auth) {
        // Implementation
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
    
    public UserResponse registerUser(UserRegistrationRequest request) {
        // Validate user input
        validateUserRegistration(request);
        
        // Hash password
        String hashedPassword = passwordEncoder.encode(request.getPassword());
        
        // Create user entity
        User user = User.builder()
            .userId(UUID.randomUUID())
            .email(request.getEmail())
            .password(hashedPassword)
            .firstName(request.getFirstName())
            .lastName(request.getLastName())
            .role(UserRole.CUSTOMER)
            .isActive(true)
            .createdAt(LocalDateTime.now())
            .build();
        
        // Save user
        User savedUser = userRepository.save(user);
        
        // Send welcome email
        notificationService.sendWelcomeEmail(savedUser.getEmail());
        
        return UserResponse.from(savedUser);
    }
    
    public AuthResponse authenticateUser(LoginRequest request) {
        // Validate credentials
        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new InvalidCredentialsException("Invalid email or password"));
        
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new InvalidCredentialsException("Invalid email or password");
        }
        
        // Generate JWT token
        String token = jwtTokenProvider.generateToken(user);
        
        // Update last login
        user.setLastLogin(LocalDateTime.now());
        userRepository.save(user);
        
        return AuthResponse.builder()
            .token(token)
            .user(UserResponse.from(user))
            .build();
    }
}

@Entity
@Table(name = "users")
public class User {
    @Id
    @Column(name = "user_id")
    private UUID userId;
    
    @Column(name = "email", unique = true, nullable = false)
    @Email
    private String email;
    
    @Column(name = "password", nullable = false)
    private String password;
    
    @Column(name = "first_name")
    private String firstName;
    
    @Column(name = "last_name")
    private String lastName;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "role")
    private UserRole role;
    
    @Column(name = "is_active")
    private Boolean isActive;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    @Column(name = "last_login")
    private LocalDateTime lastLogin;
    
    // Constructors, getters, setters, builder pattern
}
```

### 2. Product Service Component

#### Class Structure
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
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "name") String sortBy) {
        // Implementation
    }
    
    @GetMapping("/{productId}")
    public ResponseEntity<ProductDetailResponse> getProduct(@PathVariable UUID productId) {
        // Implementation
    }
    
    @PostMapping
    @PreAuthorize("hasRole('SELLER')")
    public ResponseEntity<ProductResponse> createProduct(@Valid @RequestBody CreateProductRequest request) {
        // Implementation
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
    
    public PagedResponse<ProductResponse> searchProducts(ProductSearchCriteria criteria) {
        // Check cache first
        String cacheKey = generateCacheKey(criteria);
        PagedResponse<ProductResponse> cachedResult = 
            (PagedResponse<ProductResponse>) redisTemplate.opsForValue().get(cacheKey);
        
        if (cachedResult != null) {
            return cachedResult;
        }
        
        // Build Elasticsearch query
        BoolQueryBuilder queryBuilder = QueryBuilders.boolQuery();
        
        if (StringUtils.hasText(criteria.getSearch())) {
            queryBuilder.must(QueryBuilders.multiMatchQuery(
                criteria.getSearch(), "name", "description"));
        }
        
        if (StringUtils.hasText(criteria.getCategory())) {
            queryBuilder.filter(QueryBuilders.termQuery("categoryId", criteria.getCategory()));
        }
        
        // Execute search
        SearchQuery searchQuery = new NativeSearchQueryBuilder()
            .withQuery(queryBuilder)
            .withPageable(PageRequest.of(criteria.getPage(), criteria.getSize()))
            .withSort(SortBuilders.fieldSort(criteria.getSortBy()))
            .build();
        
        SearchHits<ProductDocument> searchHits = elasticsearchTemplate.search(searchQuery, ProductDocument.class);
        
        // Convert to response
        List<ProductResponse> products = searchHits.getSearchHits().stream()
            .map(hit -> ProductResponse.from(hit.getContent()))
            .collect(Collectors.toList());
        
        PagedResponse<ProductResponse> result = PagedResponse.<ProductResponse>builder()
            .content(products)
            .totalElements(searchHits.getTotalHits())
            .page(criteria.getPage())
            .size(criteria.getSize())
            .build();
        
        // Cache result
        redisTemplate.opsForValue().set(cacheKey, result, Duration.ofMinutes(15));
        
        return result;
    }
}

@Entity
@Table(name = "products")
public class Product {
    @Id
    @Column(name = "product_id")
    private UUID productId;
    
    @Column(name = "name", nullable = false)
    private String name;
    
    @Column(name = "description")
    private String description;
    
    @Column(name = "price", nullable = false, precision = 10, scale = 2)
    private BigDecimal price;
    
    @Column(name = "seller_id", nullable = false)
    private UUID sellerId;
    
    @Column(name = "category_id")
    private UUID categoryId;
    
    @Column(name = "inventory", nullable = false)
    private Integer inventory;
    
    @ElementCollection
    @CollectionTable(name = "product_images")
    @Column(name = "image_url")
    private List<String> images;
    
    @Column(name = "is_active")
    private Boolean isActive;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    // Constructors, getters, setters
}
```

### 3. Order Service Component

#### Class Structure
```java
@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {
    
    @Autowired
    private OrderService orderService;
    
    @PostMapping("/checkout")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<OrderResponse> checkout(@Valid @RequestBody CheckoutRequest request, Authentication auth) {
        // Implementation
    }
    
    @GetMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<OrderResponse>> getUserOrders(Authentication auth) {
        // Implementation
    }
    
    @GetMapping("/{orderId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<OrderDetailResponse> getOrder(@PathVariable UUID orderId, Authentication auth) {
        // Implementation
    }
}

@Service
@Transactional
public class OrderService {
    
    @Autowired
    private OrderRepository orderRepository;
    
    @Autowired
    private ShoppingCartService cartService;
    
    @Autowired
    private PaymentService paymentService;
    
    @Autowired
    private InventoryService inventoryService;
    
    @Autowired
    private NotificationService notificationService;
    
    public OrderResponse processCheckout(CheckoutRequest request, UUID userId) {
        // Get user's cart
        ShoppingCart cart = cartService.getActiveCart(userId);
        
        if (cart.getItems().isEmpty()) {
            throw new EmptyCartException("Cannot checkout with empty cart");
        }
        
        // Validate inventory
        validateInventoryAvailability(cart.getItems());
        
        // Calculate total amount
        BigDecimal totalAmount = calculateTotalAmount(cart.getItems());
        
        // Create order
        Order order = Order.builder()
            .orderId(UUID.randomUUID())
            .userId(userId)
            .totalAmount(totalAmount)
            .status(OrderStatus.PENDING)
            .shippingAddress(request.getShippingAddress())
            .createdAt(LocalDateTime.now())
            .build();
        
        // Create order items
        List<OrderItem> orderItems = cart.getItems().stream()
            .map(cartItem -> OrderItem.builder()
                .orderItemId(UUID.randomUUID())
                .orderId(order.getOrderId())
                .productId(cartItem.getProductId())
                .quantity(cartItem.getQuantity())
                .unitPrice(cartItem.getUnitPrice())
                .totalPrice(cartItem.getUnitPrice().multiply(BigDecimal.valueOf(cartItem.getQuantity())))
                .build())
            .collect(Collectors.toList());
        
        order.setItems(orderItems);
        
        // Save order
        Order savedOrder = orderRepository.save(order);
        
        // Process payment
        PaymentResponse paymentResponse = paymentService.processPayment(
            PaymentRequest.builder()
                .orderId(savedOrder.getOrderId())
                .amount(totalAmount)
                .paymentMethod(request.getPaymentMethod())
                .paymentDetails(request.getPaymentDetails())
                .build());
        
        if (paymentResponse.getStatus() == PaymentStatus.SUCCESS) {
            // Update order status
            savedOrder.setStatus(OrderStatus.CONFIRMED);
            orderRepository.save(savedOrder);
            
            // Update inventory
            inventoryService.reserveItems(orderItems);
            
            // Clear cart
            cartService.clearCart(userId);
            
            // Send confirmation email
            notificationService.sendOrderConfirmation(savedOrder);
        } else {
            // Handle payment failure
            savedOrder.setStatus(OrderStatus.PAYMENT_FAILED);
            orderRepository.save(savedOrder);
            throw new PaymentProcessingException("Payment processing failed");
        }
        
        return OrderResponse.from(savedOrder);
    }
}

@Entity
@Table(name = "orders")
public class Order {
    @Id
    @Column(name = "order_id")
    private UUID orderId;
    
    @Column(name = "user_id", nullable = false)
    private UUID userId;
    
    @Column(name = "total_amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal totalAmount;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "status")
    private OrderStatus status;
    
    @Embedded
    private ShippingAddress shippingAddress;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    @OneToMany(mappedBy = "orderId", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<OrderItem> items;
    
    // Constructors, getters, setters
}
```

### 4. Payment Service Component

#### Class Structure
```java
@Service
@Transactional
public class PaymentService {
    
    @Autowired
    private PaymentRepository paymentRepository;
    
    @Autowired
    private PaymentGatewayFactory gatewayFactory;
    
    @Autowired
    private FraudDetectionService fraudDetectionService;
    
    public PaymentResponse processPayment(PaymentRequest request) {
        // Fraud detection
        FraudAssessment fraudAssessment = fraudDetectionService.assess(request);
        
        if (fraudAssessment.getRiskLevel() == RiskLevel.HIGH) {
            throw new FraudDetectedException("Transaction flagged as high risk");
        }
        
        // Create payment record
        Payment payment = Payment.builder()
            .paymentId(UUID.randomUUID())
            .orderId(request.getOrderId())
            .amount(request.getAmount())
            .method(request.getPaymentMethod())
            .status(PaymentStatus.PROCESSING)
            .build();
        
        Payment savedPayment = paymentRepository.save(payment);
        
        try {
            // Get appropriate payment gateway
            PaymentGateway gateway = gatewayFactory.getGateway(request.getPaymentMethod());
            
            // Process payment through gateway
            GatewayResponse gatewayResponse = gateway.processPayment(
                GatewayRequest.builder()
                    .amount(request.getAmount())
                    .paymentDetails(request.getPaymentDetails())
                    .orderId(request.getOrderId().toString())
                    .build());
            
            // Update payment status
            savedPayment.setStatus(gatewayResponse.isSuccess() ? 
                PaymentStatus.SUCCESS : PaymentStatus.FAILED);
            savedPayment.setTransactionId(gatewayResponse.getTransactionId());
            savedPayment.setProcessedAt(LocalDateTime.now());
            
            paymentRepository.save(savedPayment);
            
            return PaymentResponse.from(savedPayment);
            
        } catch (Exception e) {
            // Handle payment processing error
            savedPayment.setStatus(PaymentStatus.ERROR);
            paymentRepository.save(savedPayment);
            
            throw new PaymentProcessingException("Payment processing failed: " + e.getMessage());
        }
    }
}

@Component
public class PaymentGatewayFactory {
    
    @Autowired
    private StripePaymentGateway stripeGateway;
    
    @Autowired
    private PayPalPaymentGateway paypalGateway;
    
    public PaymentGateway getGateway(PaymentMethod method) {
        switch (method) {
            case CREDIT_CARD:
            case DEBIT_CARD:
                return stripeGateway;
            case PAYPAL:
                return paypalGateway;
            default:
                throw new UnsupportedPaymentMethodException("Unsupported payment method: " + method);
        }
    }
}
```

## Data Flow Diagrams

### User Registration Flow
```
Client → API Gateway → User Service → Database
   ↓
Validation → Password Hashing → User Creation → Email Notification
```

### Product Search Flow
```
Client → API Gateway → Product Service → Redis Cache
                                     ↓ (Cache Miss)
                                Elasticsearch → Database
                                     ↓
                               Cache Update → Response
```

### Checkout Flow
```
Client → API Gateway → Order Service → Cart Service
                           ↓
                    Inventory Validation
                           ↓
                    Payment Service → Payment Gateway
                           ↓
                    Order Confirmation → Notification Service
```

## Sequence Diagrams

### User Authentication Sequence
```
Client          API Gateway     User Service    Database    JWT Service
  |                 |               |            |           |
  |-- POST /login --|               |            |           |
  |                 |-- validate ---|            |           |
  |                 |               |-- query ---|           |
  |                 |               |            |-- user ---|           |
  |                 |               |-- verify password      |
  |                 |               |-- generate token ------|           |
  |                 |               |            |           |-- JWT --|
  |                 |-- response ---|            |           |
  |-- 200 + token --|               |            |           |
```

### Order Processing Sequence
```
Client      Order Service   Cart Service   Payment Service   Inventory Service
  |             |               |              |                 |
  |-- checkout--|               |              |                 |
  |             |-- get cart ---|              |                 |
  |             |               |-- cart items-|                 |
  |             |-- validate inventory --------|                 |
  |             |               |              |-- check stock --|                 |
  |             |-- process payment ----------|                 |
  |             |               |              |-- gateway call-|
  |             |               |              |-- success ------|                 |
  |             |-- reserve items -------------|                 |
  |             |               |              |                 |-- update ----|
  |-- order id-|               |              |                 |
```

## Implementation Details

### Configuration Classes

#### Security Configuration
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
            AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf().disable()
            .authorizeHttpRequests(authz -> authz
                .requestMatchers("/api/v1/users/register", "/api/v1/users/login").permitAll()
                .requestMatchers("/api/v1/products/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/products").hasRole("SELLER")
                .requestMatchers("/api/v1/orders/**").hasRole("USER")
                .anyRequest().authenticated()
            )
            .exceptionHandling().authenticationEntryPoint(jwtAuthenticationEntryPoint)
            .and()
            .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS);
        
        http.addFilterBefore(jwtRequestFilter, UsernamePasswordAuthenticationFilter.class);
        
        return http.build();
    }
}
```

#### Database Configuration
```java
@Configuration
@EnableJpaRepositories(basePackages = "com.shopping.repository")
@EnableTransactionManagement
public class DatabaseConfig {
    
    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource")
    public DataSource primaryDataSource() {
        return DataSourceBuilder.create().build();
    }
    
    @Bean
    @ConfigurationProperties("spring.datasource.read")
    public DataSource readOnlyDataSource() {
        return DataSourceBuilder.create().build();
    }
    
    @Bean
    public PlatformTransactionManager transactionManager() {
        return new JpaTransactionManager();
    }
}
```

#### Redis Configuration
```java
@Configuration
@EnableCaching
public class RedisConfig {
    
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
            .entryTtl(Duration.ofMinutes(15))
            .serializeKeysWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()));
    }
}
```

## Database Design

### Schema Definition
```sql
-- Users table
CREATE TABLE users (
    user_id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE categories (
    category_id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(category_id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE products (
    product_id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    seller_id UUID NOT NULL REFERENCES users(user_id),
    category_id UUID REFERENCES categories(category_id),
    inventory INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product images table
CREATE TABLE product_images (
    image_id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(product_id),
    image_url VARCHAR(500) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shopping carts table
CREATE TABLE shopping_carts (
    cart_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cart items table
CREATE TABLE cart_items (
    cart_item_id UUID PRIMARY KEY,
    cart_id UUID NOT NULL REFERENCES shopping_carts(cart_id),
    product_id UUID NOT NULL REFERENCES products(product_id),
    quantity INTEGER NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE orders (
    order_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id),
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    shipping_address_line1 VARCHAR(255),
    shipping_address_line2 VARCHAR(255),
    shipping_city VARCHAR(100),
    shipping_state VARCHAR(100),
    shipping_zip VARCHAR(20),
    shipping_country VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order items table
CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(order_id),
    product_id UUID NOT NULL REFERENCES products(product_id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL
);

-- Payments table
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(order_id),
    amount DECIMAL(10,2) NOT NULL,
    method VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    transaction_id VARCHAR(255),
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reviews table
CREATE TABLE reviews (
    review_id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(product_id),
    user_id UUID NOT NULL REFERENCES users(user_id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, user_id)
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_reviews_product ON reviews(product_id);
```

## API Specifications

### OpenAPI 3.0 Specification
```yaml
openapi: 3.0.3
info:
  title: Online Shopping Platform API
  description: RESTful API for DavTest3 Online Shopping Platform
  version: 1.0.0
  contact:
    name: API Support
    email: api-support@shopping.com

servers:
  - url: https://api.shopping.com/v1
    description: Production server
  - url: https://staging-api.shopping.com/v1
    description: Staging server

paths:
  /users/register:
    post:
      summary: Register a new user
      tags:
        - Users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UserRegistrationRequest'
      responses:
        '201':
          description: User registered successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
        '400':
          description: Invalid input
        '409':
          description: Email already exists

  /users/login:
    post:
      summary: Authenticate user
      tags:
        - Users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LoginRequest'
      responses:
        '200':
          description: Authentication successful
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthResponse'
        '401':
          description: Invalid credentials

  /products:
    get:
      summary: Search products
      tags:
        - Products
      parameters:
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
        - name: search
          in: query
          schema:
            type: string
        - name: category
          in: query
          schema:
            type: string
      responses:
        '200':
          description: Products retrieved successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PagedProductResponse'

    post:
      summary: Create a new product
      tags:
        - Products
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateProductRequest'
      responses:
        '201':
          description: Product created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ProductResponse'
        '401':
          description: Unauthorized
        '403':
          description: Forbidden - Seller role required

  /orders/checkout:
    post:
      summary: Process checkout
      tags:
        - Orders
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CheckoutRequest'
      responses:
        '201':
          description: Order created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OrderResponse'
        '400':
          description: Invalid checkout data
        '401':
          description: Unauthorized

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    UserRegistrationRequest:
      type: object
      required:
        - email
        - password
        - firstName
        - lastName
      properties:
        email:
          type: string
          format: email
        password:
          type: string
          minLength: 8
        firstName:
          type: string
          minLength: 1
        lastName:
          type: string
          minLength: 1

    LoginRequest:
      type: object
      required:
        - email
        - password
      properties:
        email:
          type: string
          format: email
        password:
          type: string

    UserResponse:
      type: object
      properties:
        userId:
          type: string
          format: uuid
        email:
          type: string
        firstName:
          type: string
        lastName:
          type: string
        role:
          type: string
          enum: [CUSTOMER, SELLER, ADMIN]
        createdAt:
          type: string
          format: date-time

    AuthResponse:
      type: object
      properties:
        token:
          type: string
        user:
          $ref: '#/components/schemas/UserResponse'

    CreateProductRequest:
      type: object
      required:
        - name
        - description
        - price
        - categoryId
        - inventory
      properties:
        name:
          type: string
        description:
          type: string
        price:
          type: number
          format: decimal
        categoryId:
          type: string
          format: uuid
        inventory:
          type: integer
          minimum: 0
        images:
          type: array
          items:
            type: string
            format: uri

    ProductResponse:
      type: object
      properties:
        productId:
          type: string
          format: uuid
        name:
          type: string
        description:
          type: string
        price:
          type: number
          format: decimal
        sellerId:
          type: string
          format: uuid
        categoryId:
          type: string
          format: uuid
        inventory:
          type: integer
        images:
          type: array
          items:
            type: string
        isActive:
          type: boolean
        createdAt:
          type: string
          format: date-time

    PagedProductResponse:
      type: object
      properties:
        content:
          type: array
          items:
            $ref: '#/components/schemas/ProductResponse'
        totalElements:
          type: integer
        page:
          type: integer
        size:
          type: integer
        totalPages:
          type: integer

    CheckoutRequest:
      type: object
      required:
        - shippingAddress
        - paymentMethod
        - paymentDetails
      properties:
        shippingAddress:
          $ref: '#/components/schemas/ShippingAddress'
        paymentMethod:
          type: string
          enum: [CREDIT_CARD, DEBIT_CARD, PAYPAL]
        paymentDetails:
          type: object

    ShippingAddress:
      type: object
      required:
        - line1
        - city
        - state
        - zipCode
        - country
      properties:
        line1:
          type: string
        line2:
          type: string
        city:
          type: string
        state:
          type: string
        zipCode:
          type: string
        country:
          type: string

    OrderResponse:
      type: object
      properties:
        orderId:
          type: string
          format: uuid
        userId:
          type: string
          format: uuid
        totalAmount:
          type: number
          format: decimal
        status:
          type: string
          enum: [PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED]
        shippingAddress:
          $ref: '#/components/schemas/ShippingAddress'
        items:
          type: array
          items:
            $ref: '#/components/schemas/OrderItemResponse'
        createdAt:
          type: string
          format: date-time

    OrderItemResponse:
      type: object
      properties:
        orderItemId:
          type: string
          format: uuid
        productId:
          type: string
          format: uuid
        quantity:
          type: integer
        unitPrice:
          type: number
          format: decimal
        totalPrice:
          type: number
          format: decimal
```

## Security Implementation

### JWT Token Implementation
```java
@Component
public class JwtTokenProvider {
    
    private static final String JWT_SECRET = "${app.jwt.secret}";
    private static final int JWT_EXPIRATION = 86400; // 24 hours
    
    @Value("${app.jwt.secret}")
    private String jwtSecret;
    
    @Value("${app.jwt.expiration}")
    private int jwtExpirationInMs;
    
    public String generateToken(User user) {
        Date expiryDate = new Date(System.currentTimeMillis() + jwtExpirationInMs);
        
        return Jwts.builder()
            .setSubject(user.getUserId().toString())
            .claim("email", user.getEmail())
            .claim("role", user.getRole().name())
            .setIssuedAt(new Date())
            .setExpiration(expiryDate)
            .signWith(SignatureAlgorithm.HS512, jwtSecret)
            .compact();
    }
    
    public UUID getUserIdFromToken(String token) {
        Claims claims = Jwts.parser()
            .setSigningKey(jwtSecret)
            .parseClaimsJws(token)
            .getBody();
        
        return UUID.fromString(claims.getSubject());
    }
    
    public boolean validateToken(String authToken) {
        try {
            Jwts.parser().setSigningKey(jwtSecret).parseClaimsJws(authToken);
            return true;
        } catch (SignatureException ex) {
            logger.error("Invalid JWT signature");
        } catch (MalformedJwtException ex) {
            logger.error("Invalid JWT token");
        } catch (ExpiredJwtException ex) {
            logger.error("Expired JWT token");
        } catch (UnsupportedJwtException ex) {
            logger.error("Unsupported JWT token");
        } catch (IllegalArgumentException ex) {
            logger.error("JWT claims string is empty");
        }
        return false;
    }
}
```

### Input Validation
```java
@Component
public class InputValidator {
    
    private static final String EMAIL_PATTERN = 
        "^[a-zA-Z0-9_+&*-]+(?:\\.[a-zA-Z0-9_+&*-]+)*@" +
        "(?:[a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,7}$";
    
    private static final Pattern emailPattern = Pattern.compile(EMAIL_PATTERN);
    
    public void validateUserRegistration(UserRegistrationRequest request) {
        List<String> errors = new ArrayList<>();
        
        // Email validation
        if (!emailPattern.matcher(request.getEmail()).matches()) {
            errors.add("Invalid email format");
        }
        
        // Password validation
        if (request.getPassword().length() < 8) {
            errors.add("Password must be at least 8 characters long");
        }
        
        if (!request.getPassword().matches(".*[A-Z].*")) {
            errors.add("Password must contain at least one uppercase letter");
        }
        
        if (!request.getPassword().matches(".*[a-z].*")) {
            errors.add("Password must contain at least one lowercase letter");
        }
        
        if (!request.getPassword().matches(".*\\d.*")) {
            errors.add("Password must contain at least one digit");
        }
        
        if (!request.getPassword().matches(".*[!@#$%^&*()_+\\-=\\[\\]{};':.,<>?].*")) {
            errors.add("Password must contain at least one special character");
        }
        
        // Name validation
        if (request.getFirstName() == null || request.getFirstName().trim().isEmpty()) {
            errors.add("First name is required");
        }
        
        if (request.getLastName() == null || request.getLastName().trim().isEmpty()) {
            errors.add("Last name is required");
        }
        
        if (!errors.isEmpty()) {
            throw new ValidationException("Validation failed: " + String.join(", ", errors));
        }
    }
    
    public void sanitizeInput(String input) {
        if (input == null) return null;
        
        // Remove potential XSS vectors
        return input.replaceAll("<script[^>]*>.*?</script>", "")
                   .replaceAll("<[^>]+>", "")
                   .replaceAll("javascript:", "")
                   .replaceAll("on\\w+\\s*=", "");
    }
}
```

## Performance Optimization

### Caching Strategy
```java
@Service
public class CacheService {
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    private static final String PRODUCT_CACHE_PREFIX = "product:";
    private static final String SEARCH_CACHE_PREFIX = "search:";
    private static final Duration DEFAULT_TTL = Duration.ofMinutes(15);
    
    @Cacheable(value = "products", key = "#productId")
    public ProductResponse getProduct(UUID productId) {
        String cacheKey = PRODUCT_CACHE_PREFIX + productId;
        ProductResponse cached = (ProductResponse) redisTemplate.opsForValue().get(cacheKey);
        
        if (cached != null) {
            return cached;
        }
        
        // Fetch from database
        Product product = productRepository.findById(productId)
            .orElseThrow(() -> new ProductNotFoundException("Product not found"));
        
        ProductResponse response = ProductResponse.from(product);
        
        // Cache the result
        redisTemplate.opsForValue().set(cacheKey, response, DEFAULT_TTL);
        
        return response;
    }
    
    @CacheEvict(value = "products", key = "#productId")
    public void evictProduct(UUID productId) {
        String cacheKey = PRODUCT_CACHE_PREFIX + productId;
        redisTemplate.delete(cacheKey);
    }
    
    public void cacheSearchResults(String searchKey, PagedResponse<ProductResponse> results) {
        String cacheKey = SEARCH_CACHE_PREFIX + DigestUtils.md5Hex(searchKey);
        redisTemplate.opsForValue().set(cacheKey, results, Duration.ofMinutes(5));
    }
}
```

### Database Optimization
```java
@Repository
public interface ProductRepository extends JpaRepository<Product, UUID> {
    
    @Query("SELECT p FROM Product p WHERE p.isActive = true AND " +
           "(:category IS NULL OR p.categoryId = :category) AND " +
           "(:minPrice IS NULL OR p.price >= :minPrice) AND " +
           "(:maxPrice IS NULL OR p.price <= :maxPrice)")
    Page<Product> findProductsWithFilters(
        @Param("category") UUID category,
        @Param("minPrice") BigDecimal minPrice,
        @Param("maxPrice") BigDecimal maxPrice,
        Pageable pageable);
    
    @Query("SELECT p FROM Product p WHERE p.sellerId = :sellerId AND p.isActive = true")
    List<Product> findActiveProductsBySeller(@Param("sellerId") UUID sellerId);
    
    @Modifying
    @Query("UPDATE Product p SET p.inventory = p.inventory - :quantity WHERE p.productId = :productId")
    int decreaseInventory(@Param("productId") UUID productId, @Param("quantity") int quantity);
}
```

### Async Processing
```java
@Service
public class AsyncOrderProcessor {
    
    @Autowired
    private NotificationService notificationService;
    
    @Autowired
    private InventoryService inventoryService;
    
    @Autowired
    private AnalyticsService analyticsService;
    
    @Async("orderProcessingExecutor")
    public CompletableFuture<Void> processOrderAsync(Order order) {
        try {
            // Send confirmation email
            notificationService.sendOrderConfirmation(order);
            
            // Update analytics
            analyticsService.recordOrderEvent(order);
            
            // Schedule inventory reorder if needed
            inventoryService.checkReorderLevels(order.getItems());
            
            return CompletableFuture.completedFuture(null);
        } catch (Exception e) {
            logger.error("Error processing order asynchronously: {}", order.getOrderId(), e);
            return CompletableFuture.failedFuture(e);
        }
    }
}

@Configuration
@EnableAsync
public class AsyncConfig {
    
    @Bean(name = "orderProcessingExecutor")
    public Executor orderProcessingExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);
        executor.setMaxPoolSize(10);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("OrderProcessor-");
        executor.initialize();
        return executor;
    }
}
```

This comprehensive Low-Level Design document provides detailed implementation specifications for the DavTest3 Online Shopping Platform, including component architectures, data flows, sequence diagrams, security implementations, and performance optimizations. The design ensures scalability, security, and maintainability while meeting all functional and non-functional requirements identified in the HLD analysis.