# Low-Level Design Document - QETesting0715

## Table of Contents
1. [Component Specifications](#component-specifications)
2. [Data Flow Diagrams](#data-flow-diagrams)
3. [Sequence Diagrams](#sequence-diagrams)
4. [Implementation Details](#implementation-details)
5. [Database Schema](#database-schema)
6. [API Specifications](#api-specifications)
7. [Security Implementation](#security-implementation)
8. [Error Handling](#error-handling)
9. [Testing Strategy](#testing-strategy)

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
        UserResponse response = userService.registerUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
    
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> authenticateUser(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = userService.authenticateUser(request);
        return ResponseEntity.ok(response);
    }
    
    @GetMapping("/profile/{userId}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<UserProfileResponse> getUserProfile(@PathVariable UUID userId) {
        UserProfileResponse profile = userService.getUserProfile(userId);
        return ResponseEntity.ok(profile);
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
    private AuditService auditService;
    
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
            .updatedAt(LocalDateTime.now())
            .build();
            
        User savedUser = userRepository.save(user);
        auditService.logUserAction(savedUser.getUserId(), "USER_REGISTERED", "User", savedUser.getUserId());
        
        return UserResponse.from(savedUser);
    }
    
    public AuthResponse authenticateUser(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new AuthenticationException("Invalid credentials"));
            
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            auditService.logUserAction(user.getUserId(), "LOGIN_FAILED", "User", user.getUserId());
            throw new AuthenticationException("Invalid credentials");
        }
        
        String accessToken = jwtTokenProvider.generateAccessToken(user);
        String refreshToken = jwtTokenProvider.generateRefreshToken(user);
        
        auditService.logUserAction(user.getUserId(), "LOGIN_SUCCESS", "User", user.getUserId());
        
        return AuthResponse.builder()
            .accessToken(accessToken)
            .refreshToken(refreshToken)
            .tokenType("Bearer")
            .expiresIn(jwtTokenProvider.getAccessTokenExpiration())
            .user(UserResponse.from(user))
            .build();
    }
}
```

#### Database Entity
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
    private String firstName;
    
    @Column(name = "last_name", nullable = false)
    private String lastName;
    
    @Column(name = "phone")
    private String phone;
    
    @Column(name = "address")
    private String address;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false)
    private UserRole role;
    
    @Column(name = "is_active", nullable = false)
    private Boolean isActive;
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
    
    @OneToOne(mappedBy = "user", cascade = CascadeType.ALL)
    private UserProfile userProfile;
    
    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL)
    private List<Order> orders;
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
            @RequestParam(required = false) String search) {
        
        ProductSearchCriteria criteria = ProductSearchCriteria.builder()
            .page(page)
            .size(size)
            .category(category)
            .searchTerm(search)
            .build();
            
        PagedResponse<ProductResponse> products = productService.searchProducts(criteria);
        return ResponseEntity.ok(products);
    }
    
    @GetMapping("/{productId}")
    public ResponseEntity<ProductDetailResponse> getProductDetails(@PathVariable UUID productId) {
        ProductDetailResponse product = productService.getProductDetails(productId);
        return ResponseEntity.ok(product);
    }
    
    @PostMapping
    @PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
    public ResponseEntity<ProductResponse> createProduct(@Valid @RequestBody CreateProductRequest request) {
        ProductResponse product = productService.createProduct(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(product);
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
    private InventoryService inventoryService;
    
    @Autowired
    private ImageUploadService imageUploadService;
    
    public PagedResponse<ProductResponse> searchProducts(ProductSearchCriteria criteria) {
        BoolQueryBuilder queryBuilder = QueryBuilders.boolQuery();
        
        if (StringUtils.hasText(criteria.getSearchTerm())) {
            queryBuilder.must(QueryBuilders.multiMatchQuery(criteria.getSearchTerm())
                .field("name", 2.0f)
                .field("description", 1.0f)
                .field("category", 1.5f));
        }
        
        if (StringUtils.hasText(criteria.getCategory())) {
            queryBuilder.filter(QueryBuilders.termQuery("category.keyword", criteria.getCategory()));
        }
        
        queryBuilder.filter(QueryBuilders.termQuery("isActive", true));
        
        SearchRequest searchRequest = new SearchRequest("products")
            .source(new SearchSourceBuilder()
                .query(queryBuilder)
                .from(criteria.getPage() * criteria.getSize())
                .size(criteria.getSize())
                .sort("createdAt", SortOrder.DESC));
                
        SearchResponse response = elasticsearchTemplate.search(searchRequest, RequestOptions.DEFAULT);
        
        List<ProductResponse> products = Arrays.stream(response.getHits().getHits())
            .map(hit -> convertToProductResponse(hit.getSourceAsMap()))
            .collect(Collectors.toList());
            
        return PagedResponse.<ProductResponse>builder()
            .content(products)
            .page(criteria.getPage())
            .size(criteria.getSize())
            .totalElements(response.getHits().getTotalHits().value)
            .totalPages((int) Math.ceil((double) response.getHits().getTotalHits().value / criteria.getSize()))
            .build();
    }
    
    public ProductResponse createProduct(CreateProductRequest request) {
        validateProductRequest(request);
        
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
            .updatedAt(LocalDateTime.now())
            .build();
            
        Product savedProduct = productRepository.save(product);
        
        // Initialize inventory
        inventoryService.createInventory(savedProduct.getProductId(), request.getInitialStock());
        
        // Index in Elasticsearch
        indexProductInElasticsearch(savedProduct);
        
        return ProductResponse.from(savedProduct);
    }
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
    
    @PostMapping
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<OrderResponse> createOrder(@Valid @RequestBody CreateOrderRequest request) {
        OrderResponse order = orderService.createOrder(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(order);
    }
    
    @GetMapping("/{orderId}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<OrderDetailResponse> getOrderDetails(@PathVariable UUID orderId) {
        OrderDetailResponse order = orderService.getOrderDetails(orderId);
        return ResponseEntity.ok(order);
    }
    
    @PutMapping("/{orderId}/status")
    @PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
    public ResponseEntity<OrderResponse> updateOrderStatus(
            @PathVariable UUID orderId,
            @Valid @RequestBody UpdateOrderStatusRequest request) {
        OrderResponse order = orderService.updateOrderStatus(orderId, request.getStatus());
        return ResponseEntity.ok(order);
    }
}

@Service
@Transactional
public class OrderService {
    
    @Autowired
    private OrderRepository orderRepository;
    
    @Autowired
    private ProductService productService;
    
    @Autowired
    private InventoryService inventoryService;
    
    @Autowired
    private PaymentService paymentService;
    
    @Autowired
    private NotificationService notificationService;
    
    public OrderResponse createOrder(CreateOrderRequest request) {
        validateOrderRequest(request);
        
        // Check inventory availability
        for (OrderItemRequest item : request.getItems()) {
            if (!inventoryService.isStockAvailable(item.getProductId(), item.getQuantity())) {
                throw new InsufficientStockException("Insufficient stock for product: " + item.getProductId());
            }
        }
        
        // Calculate total amount
        BigDecimal totalAmount = calculateTotalAmount(request.getItems());
        
        Order order = Order.builder()
            .orderId(UUID.randomUUID())
            .userId(request.getUserId())
            .orderDate(LocalDate.now())
            .totalAmount(totalAmount)
            .status(OrderStatus.PENDING)
            .shippingAddress(request.getShippingAddress())
            .paymentMethod(request.getPaymentMethod())
            .createdAt(LocalDateTime.now())
            .updatedAt(LocalDateTime.now())
            .build();
            
        Order savedOrder = orderRepository.save(order);
        
        // Create order items
        List<OrderItem> orderItems = createOrderItems(savedOrder.getOrderId(), request.getItems());
        savedOrder.setOrderItems(orderItems);
        
        // Reserve inventory
        reserveInventory(request.getItems());
        
        // Process payment
        PaymentRequest paymentRequest = PaymentRequest.builder()
            .orderId(savedOrder.getOrderId())
            .amount(totalAmount)
            .paymentMethod(request.getPaymentMethod())
            .build();
            
        PaymentResponse paymentResponse = paymentService.processPayment(paymentRequest);
        
        if (paymentResponse.getStatus() == PaymentStatus.COMPLETED) {
            savedOrder.setStatus(OrderStatus.CONFIRMED);
            orderRepository.save(savedOrder);
            
            // Send confirmation notification
            notificationService.sendOrderConfirmation(savedOrder);
        }
        
        return OrderResponse.from(savedOrder);
    }
    
    @Async
    public void updateOrderStatus(UUID orderId, OrderStatus newStatus) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException("Order not found: " + orderId));
            
        OrderStatus previousStatus = order.getStatus();
        order.setStatus(newStatus);
        order.setUpdatedAt(LocalDateTime.now());
        
        if (newStatus == OrderStatus.SHIPPED) {
            order.setTrackingNumber(generateTrackingNumber());
        }
        
        orderRepository.save(order);
        
        // Send status update notification
        notificationService.sendOrderStatusUpdate(order, previousStatus, newStatus);
    }
}
```

## Data Flow Diagrams

### User Registration Flow
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │ API Gateway │    │User Service │    │  Database   │    │Email Service│
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │                  │
       │ POST /register   │                  │                  │                  │
       ├─────────────────►│                  │                  │                  │
       │                  │ Validate Request │                  │                  │
       │                  ├─────────────────►│                  │                  │
       │                  │                  │ Hash Password    │                  │
       │                  │                  │ Generate UUID    │                  │
       │                  │                  ├─────────────────►│                  │
       │                  │                  │                  │ Save User        │
       │                  │                  │                  │                  │
       │                  │                  │ User Created     │                  │
       │                  │                  │◄─────────────────┤                  │
       │                  │                  │                  │                  │
       │                  │                  │ Send Welcome Email                  │
       │                  │                  ├────────────────────────────────────►│
       │                  │ User Response    │                  │                  │
       │                  │◄─────────────────┤                  │                  │
       │ 201 Created      │                  │                  │                  │
       │◄─────────────────┤                  │                  │                  │
```

### Product Search Flow
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │ API Gateway │    │Product Svc  │    │Elasticsearch│    │Redis Cache  │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │                  │
       │ GET /products    │                  │                  │                  │
       ├─────────────────►│                  │                  │                  │
       │                  │ Search Request   │                  │                  │
       │                  ├─────────────────►│                  │                  │
       │                  │                  │ Check Cache      │                  │
       │                  │                  ├────────────────────────────────────►│
       │                  │                  │                  │                  │
       │                  │                  │ Cache Miss       │                  │
       │                  │                  │◄────────────────────────────────────┤
       │                  │                  │                  │                  │
       │                  │                  │ Search Query     │                  │
       │                  │                  ├─────────────────►│                  │
       │                  │                  │                  │                  │
       │                  │                  │ Search Results   │                  │
       │                  │                  │◄─────────────────┤                  │
       │                  │                  │                  │                  │
       │                  │                  │ Cache Results    │                  │
       │                  │                  ├────────────────────────────────────►│
       │                  │ Product List     │                  │                  │
       │                  │◄─────────────────┤                  │                  │
       │ 200 OK           │                  │                  │                  │
       │◄─────────────────┤                  │                  │                  │
```

### Order Processing Flow
```
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│ Client  │  │Order Svc│  │Payment  │  │Inventory│  │Database │  │Notify   │
│         │  │         │  │Service  │  │Service  │  │         │  │Service  │
└────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
     │            │            │            │            │            │
     │POST /order │            │            │            │            │
     ├───────────►│            │            │            │            │
     │            │Check Stock │            │            │            │
     │            ├───────────────────────►│            │            │
     │            │            │            │Stock OK    │            │
     │            │◄───────────────────────┤            │            │
     │            │            │            │            │            │
     │            │Reserve Stock           │            │            │
     │            ├───────────────────────►│            │            │
     │            │            │            │            │            │
     │            │Save Order  │            │            │            │
     │            ├──────────────────────────────────►│            │
     │            │            │            │            │            │
     │            │Process Payment         │            │            │
     │            ├───────────►│            │            │            │
     │            │            │Payment OK  │            │            │
     │            │◄───────────┤            │            │            │
     │            │            │            │            │            │
     │            │Update Status           │            │            │
     │            ├──────────────────────────────────►│            │
     │            │            │            │            │            │
     │            │Send Notification                   │            │
     │            ├──────────────────────────────────────────────►│
     │Order Created            │            │            │            │
     │◄───────────┤            │            │            │            │
```

## Sequence Diagrams

### Payment Processing Sequence
```
participant Client
participant OrderService
participant PaymentService
participant PaymentGateway
participant FraudDetection
participant Database
participant NotificationService

Client->>OrderService: Create Order Request
OrderService->>PaymentService: Process Payment Request
PaymentService->>FraudDetection: Validate Transaction
FraudDetection-->>PaymentService: Validation Result

alt Fraud Check Passed
    PaymentService->>PaymentGateway: Charge Payment
    PaymentGateway-->>PaymentService: Payment Response
    
    alt Payment Successful
        PaymentService->>Database: Save Payment Record
        PaymentService-->>OrderService: Payment Confirmed
        OrderService->>Database: Update Order Status
        OrderService->>NotificationService: Send Confirmation
        OrderService-->>Client: Order Confirmed
    else Payment Failed
        PaymentService->>Database: Log Failed Payment
        PaymentService-->>OrderService: Payment Failed
        OrderService-->>Client: Payment Error
    end
else Fraud Detected
    PaymentService->>Database: Log Suspicious Activity
    PaymentService-->>OrderService: Transaction Blocked
    OrderService-->>Client: Transaction Declined
end
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
    private JwtAuthenticationFilter jwtAuthenticationFilter;
    
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }
    
    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.cors().and().csrf().disable()
            .exceptionHandling().authenticationEntryPoint(jwtAuthenticationEntryPoint)
            .and()
            .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            .and()
            .authorizeHttpRequests(authz -> authz
                .requestMatchers("/api/v1/auth/**").permitAll()
                .requestMatchers("/api/v1/products/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/reviews/**").permitAll()
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/v1/products/**").hasAnyRole("SELLER", "ADMIN")
                .anyRequest().authenticated()
            );
            
        http.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        
        return http.build();
    }
}
```

#### Database Configuration
```java
@Configuration
@EnableJpaRepositories(basePackages = "com.ecommerce.repository")
@EnableTransactionManagement
public class DatabaseConfig {
    
    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource.primary")
    public DataSource primaryDataSource() {
        return DataSourceBuilder.create().build();
    }
    
    @Bean
    @ConfigurationProperties("spring.datasource.readonly")
    public DataSource readOnlyDataSource() {
        return DataSourceBuilder.create().build();
    }
    
    @Bean
    public DataSource routingDataSource() {
        RoutingDataSource routingDataSource = new RoutingDataSource();
        
        Map<Object, Object> dataSourceMap = new HashMap<>();
        dataSourceMap.put("primary", primaryDataSource());
        dataSourceMap.put("readonly", readOnlyDataSource());
        
        routingDataSource.setTargetDataSources(dataSourceMap);
        routingDataSource.setDefaultTargetDataSource(primaryDataSource());
        
        return routingDataSource;
    }
    
    @Bean
    public JpaTransactionManager transactionManager() {
        JpaTransactionManager transactionManager = new JpaTransactionManager();
        transactionManager.setDataSource(routingDataSource());
        return transactionManager;
    }
}
```

#### Redis Configuration
```java
@Configuration
@EnableCaching
public class RedisConfig {
    
    @Bean
    public LettuceConnectionFactory redisConnectionFactory() {
        RedisStandaloneConfiguration config = new RedisStandaloneConfiguration();
        config.setHostName("localhost");
        config.setPort(6379);
        config.setDatabase(0);
        
        LettuceClientConfiguration clientConfig = LettuceClientConfiguration.builder()
            .commandTimeout(Duration.ofSeconds(2))
            .shutdownTimeout(Duration.ZERO)
            .build();
            
        return new LettuceConnectionFactory(config, clientConfig);
    }
    
    @Bean
    public RedisTemplate<String, Object> redisTemplate() {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(redisConnectionFactory());
        
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
            .cacheDefaults(cacheConfiguration());
            
        return builder.build();
    }
    
    private RedisCacheConfiguration cacheConfiguration() {
        return RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(30))
            .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(new GenericJackson2JsonRedisSerializer()));
    }
}
```

## Database Schema

### SQL DDL Statements

```sql
-- Users table
CREATE TABLE users (
    user_id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    role VARCHAR(20) NOT NULL CHECK (role IN ('CONSUMER', 'SELLER', 'ADMIN')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- User profiles table
CREATE TABLE user_profiles (
    profile_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    avatar VARCHAR(500),
    preferences JSONB,
    wishlist JSONB
);

-- Products table
CREATE TABLE products (
    product_id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    category VARCHAR(100) NOT NULL,
    image_urls JSONB,
    seller_id UUID NOT NULL REFERENCES users(user_id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Inventory table
CREATE TABLE inventory (
    inventory_id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    stock_level INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 10,
    last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE orders (
    order_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id),
    order_date DATE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
    shipping_address TEXT NOT NULL,
    payment_method VARCHAR(20) NOT NULL,
    tracking_number VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Order items table
CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL
);

-- Cart items table
CREATE TABLE cart_items (
    cart_item_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id),
    product_id UUID NOT NULL REFERENCES products(product_id),
    quantity INTEGER NOT NULL,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

-- Payments table
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(order_id),
    amount DECIMAL(10,2) NOT NULL,
    method VARCHAR(20) NOT NULL CHECK (method IN ('CREDIT_CARD', 'PAYPAL', 'BANK_TRANSFER')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED')),
    transaction_id VARCHAR(255),
    processed_at TIMESTAMP
);

-- Reviews table
CREATE TABLE reviews (
    review_id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(product_id),
    user_id UUID NOT NULL REFERENCES users(user_id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, user_id)
);

-- Notifications table
CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id),
    type VARCHAR(30) NOT NULL CHECK (type IN ('ORDER_UPDATE', 'INVENTORY_ALERT', 'SYSTEM_NOTIFICATION')),
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Audit log table
CREATE TABLE audit_logs (
    log_id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(user_id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_cart_items_user ON cart_items(user_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
```

## API Specifications

### REST API Endpoints

#### Authentication Endpoints
```yaml
/api/v1/auth:
  post:
    /register:
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
                phone:
                  type: string
                address:
                  type: string
      responses:
        '201':
          description: User created successfully
        '400':
          description: Invalid input data
        '409':
          description: Email already exists
    
    /login:
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
                  tokenType:
                    type: string
                  expiresIn:
                    type: integer
        '401':
          description: Invalid credentials
```

#### Product Endpoints
```yaml
/api/v1/products:
  get:
    summary: Search products
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
      - name: category
        in: query
        schema:
          type: string
      - name: search
        in: query
        schema:
          type: string
    responses:
      '200':
        description: Products retrieved successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                content:
                  type: array
                  items:
                    $ref: '#/components/schemas/Product'
                page:
                  type: integer
                size:
                  type: integer
                totalElements:
                  type: integer
                totalPages:
                  type: integer
  
  post:
    summary: Create new product
    security:
      - BearerAuth: []
    requestBody:
      required: true
      content:
        multipart/form-data:
          schema:
            type: object
            properties:
              name:
                type: string
              description:
                type: string
              price:
                type: number
                format: decimal
              category:
                type: string
              images:
                type: array
                items:
                  type: string
                  format: binary
              initialStock:
                type: integer
    responses:
      '201':
        description: Product created successfully
      '400':
        description: Invalid input data
      '401':
        description: Unauthorized
      '403':
        description: Insufficient permissions
```

## Security Implementation

### JWT Token Provider
```java
@Component
public class JwtTokenProvider {
    
    private static final Logger logger = LoggerFactory.getLogger(JwtTokenProvider.class);
    
    @Value("${app.jwtSecret}")
    private String jwtSecret;
    
    @Value("${app.jwtExpirationInMs}")
    private int jwtExpirationInMs;
    
    @Value("${app.jwtRefreshExpirationInMs}")
    private int jwtRefreshExpirationInMs;
    
    private Key getSigningKey() {
        byte[] keyBytes = Decoders.BASE64.decode(jwtSecret);
        return Keys.hmacShaKeyFor(keyBytes);
    }
    
    public String generateAccessToken(User user) {
        Date expiryDate = new Date(System.currentTimeMillis() + jwtExpirationInMs);
        
        return Jwts.builder()
            .setSubject(user.getUserId().toString())
            .setIssuedAt(new Date())
            .setExpiration(expiryDate)
            .claim("email", user.getEmail())
            .claim("role", user.getRole().name())
            .claim("tokenType", "ACCESS")
            .signWith(getSigningKey(), SignatureAlgorithm.HS512)
            .compact();
    }
    
    public String generateRefreshToken(User user) {
        Date expiryDate = new Date(System.currentTimeMillis() + jwtRefreshExpirationInMs);
        
        return Jwts.builder()
            .setSubject(user.getUserId().toString())
            .setIssuedAt(new Date())
            .setExpiration(expiryDate)
            .claim("tokenType", "REFRESH")
            .signWith(getSigningKey(), SignatureAlgorithm.HS512)
            .compact();
    }
    
    public UUID getUserIdFromToken(String token) {
        Claims claims = Jwts.parserBuilder()
            .setSigningKey(getSigningKey())
            .build()
            .parseClaimsJws(token)
            .getBody();
            
        return UUID.fromString(claims.getSubject());
    }
    
    public boolean validateToken(String authToken) {
        try {
            Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(authToken);
            return true;
        } catch (SecurityException ex) {
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
    
    private static final Pattern EMAIL_PATTERN = 
        Pattern.compile("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");
    
    private static final Pattern PHONE_PATTERN = 
        Pattern.compile("^\\+?[1-9]\\d{1,14}$");
    
    public void validateUserRegistration(UserRegistrationRequest request) {
        List<String> errors = new ArrayList<>();
        
        if (!EMAIL_PATTERN.matcher(request.getEmail()).matches()) {
            errors.add("Invalid email format");
        }
        
        if (request.getPassword().length() < 8) {
            errors.add("Password must be at least 8 characters long");
        }
        
        if (!isPasswordStrong(request.getPassword())) {
            errors.add("Password must contain uppercase, lowercase, number, and special character");
        }
        
        if (request.getPhone() != null && !PHONE_PATTERN.matcher(request.getPhone()).matches()) {
            errors.add("Invalid phone number format");
        }
        
        if (StringUtils.isBlank(request.getFirstName()) || request.getFirstName().length() > 100) {
            errors.add("First name is required and must be less than 100 characters");
        }
        
        if (StringUtils.isBlank(request.getLastName()) || request.getLastName().length() > 100) {
            errors.add("Last name is required and must be less than 100 characters");
        }
        
        if (!errors.isEmpty()) {
            throw new ValidationException("Validation failed: " + String.join(", ", errors));
        }
    }
    
    private boolean isPasswordStrong(String password) {
        return password.matches("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$");
    }
    
    public void sanitizeInput(String input) {
        if (input == null) return;
        
        // Remove potential XSS payloads
        String sanitized = input.replaceAll("<script[^>]*>.*?</script>", "")
                               .replaceAll("<.*?>", "")
                               .replaceAll("javascript:", "")
                               .replaceAll("on\\w+\\s*=", "");
        
        // Additional sanitization can be added here
    }
}
```

## Error Handling

### Global Exception Handler
```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    
    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(ValidationException ex) {
        logger.warn("Validation error: {}", ex.getMessage());
        
        ErrorResponse errorResponse = ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(HttpStatus.BAD_REQUEST.value())
            .error("Validation Error")
            .message(ex.getMessage())
            .path(getCurrentPath())
            .build();
            
        return ResponseEntity.badRequest().body(errorResponse);
    }
    
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ErrorResponse> handleAuthenticationException(AuthenticationException ex) {
        logger.warn("Authentication error: {}", ex.getMessage());
        
        ErrorResponse errorResponse = ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(HttpStatus.UNAUTHORIZED.value())
            .error("Authentication Error")
            .message("Invalid credentials")
            .path(getCurrentPath())
            .build();
            
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(errorResponse);
    }
    
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDeniedException(AccessDeniedException ex) {
        logger.warn("Access denied: {}", ex.getMessage());
        
        ErrorResponse errorResponse = ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(HttpStatus.FORBIDDEN.value())
            .error("Access Denied")
            .message("Insufficient permissions")
            .path(getCurrentPath())
            .build();
            
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorResponse);
    }
    
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleResourceNotFoundException(ResourceNotFoundException ex) {
        logger.warn("Resource not found: {}", ex.getMessage());
        
        ErrorResponse errorResponse = ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(HttpStatus.NOT_FOUND.value())
            .error("Resource Not Found")
            .message(ex.getMessage())
            .path(getCurrentPath())
            .build();
            
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorResponse);
    }
    
    @ExceptionHandler(InsufficientStockException.class)
    public ResponseEntity<ErrorResponse> handleInsufficientStockException(InsufficientStockException ex) {
        logger.warn("Insufficient stock: {}", ex.getMessage());
        
        ErrorResponse errorResponse = ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(HttpStatus.CONFLICT.value())
            .error("Insufficient Stock")
            .message(ex.getMessage())
            .path(getCurrentPath())
            .build();
            
        return ResponseEntity.status(HttpStatus.CONFLICT).body(errorResponse);
    }
    
    @ExceptionHandler(PaymentProcessingException.class)
    public ResponseEntity<ErrorResponse> handlePaymentProcessingException(PaymentProcessingException ex) {
        logger.error("Payment processing error: {}", ex.getMessage(), ex);
        
        ErrorResponse errorResponse = ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(HttpStatus.PAYMENT_REQUIRED.value())
            .error("Payment Processing Error")
            .message("Payment could not be processed")
            .path(getCurrentPath())
            .build();
            
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(errorResponse);
    }
    
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(Exception ex) {
        logger.error("Unexpected error: {}", ex.getMessage(), ex);
        
        ErrorResponse errorResponse = ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(HttpStatus.INTERNAL_SERVER_ERROR.value())
            .error("Internal Server Error")
            .message("An unexpected error occurred")
            .path(getCurrentPath())
            .build();
            
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
    }
    
    private String getCurrentPath() {
        RequestAttributes requestAttributes = RequestContextHolder.getRequestAttributes();
        if (requestAttributes instanceof ServletRequestAttributes) {
            HttpServletRequest request = ((ServletRequestAttributes) requestAttributes).getRequest();
            return request.getRequestURI();
        }
        return "unknown";
    }
}
```

### Circuit Breaker Implementation
```java
@Component
public class PaymentServiceCircuitBreaker {
    
    private static final Logger logger = LoggerFactory.getLogger(PaymentServiceCircuitBreaker.class);
    
    @Autowired
    private PaymentGatewayClient paymentGatewayClient;
    
    @CircuitBreaker(name = "payment-service", fallbackMethod = "fallbackPayment")
    @Retry(name = "payment-service")
    @TimeLimiter(name = "payment-service")
    public CompletableFuture<PaymentResponse> processPayment(PaymentRequest request) {
        logger.info("Processing payment for order: {}", request.getOrderId());
        
        return CompletableFuture.supplyAsync(() -> {
            try {
                return paymentGatewayClient.processPayment(request);
            } catch (Exception ex) {
                logger.error("Payment processing failed for order: {}", request.getOrderId(), ex);
                throw new PaymentProcessingException("Payment processing failed", ex);
            }
        });
    }
    
    public CompletableFuture<PaymentResponse> fallbackPayment(PaymentRequest request, Exception ex) {
        logger.warn("Using fallback payment method for order: {}", request.getOrderId());
        
        // Implement fallback logic (e.g., queue for later processing)
        PaymentResponse fallbackResponse = PaymentResponse.builder()
            .paymentId(UUID.randomUUID())
            .orderId(request.getOrderId())
            .status(PaymentStatus.PENDING)
            .message("Payment queued for processing")
            .build();
            
        return CompletableFuture.completedFuture(fallbackResponse);
    }
}
```

## Testing Strategy

### Unit Tests
```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {
    
    @Mock
    private UserRepository userRepository;
    
    @Mock
    private PasswordEncoder passwordEncoder;
    
    @Mock
    private JwtTokenProvider jwtTokenProvider;
    
    @Mock
    private AuditService auditService;
    
    @InjectMocks
    private UserService userService;
    
    @Test
    void registerUser_ValidRequest_ShouldReturnUserResponse() {
        // Given
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .email("test@example.com")
            .password("StrongPass123!")
            .firstName("John")
            .lastName("Doe")
            .build();
            
        User savedUser = User.builder()
            .userId(UUID.randomUUID())
            .email(request.getEmail())
            .firstName(request.getFirstName())
            .lastName(request.getLastName())
            .role(UserRole.CONSUMER)
            .isActive(true)
            .build();
            
        when(passwordEncoder.encode(request.getPassword())).thenReturn("encodedPassword");
        when(userRepository.save(any(User.class))).thenReturn(savedUser);
        
        // When
        UserResponse response = userService.registerUser(request);
        
        // Then
        assertThat(response).isNotNull();
        assertThat(response.getEmail()).isEqualTo(request.getEmail());
        assertThat(response.getFirstName()).isEqualTo(request.getFirstName());
        assertThat(response.getLastName()).isEqualTo(request.getLastName());
        
        verify(userRepository).save(any(User.class));
        verify(auditService).logUserAction(any(UUID.class), eq("USER_REGISTERED"), eq("User"), any(UUID.class));
    }
    
    @Test
    void authenticateUser_InvalidCredentials_ShouldThrowException() {
        // Given
        LoginRequest request = new LoginRequest("test@example.com", "wrongPassword");
        User user = User.builder()
            .userId(UUID.randomUUID())
            .email(request.getEmail())
            .password("encodedPassword")
            .build();
            
        when(userRepository.findByEmail(request.getEmail())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches(request.getPassword(), user.getPassword())).thenReturn(false);
        
        // When & Then
        assertThatThrownBy(() -> userService.authenticateUser(request))
            .isInstanceOf(AuthenticationException.class)
            .hasMessage("Invalid credentials");
            
        verify(auditService).logUserAction(user.getUserId(), "LOGIN_FAILED", "User", user.getUserId());
    }
}
```

### Integration Tests
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
    void registerUser_ValidRequest_ShouldReturn201() {
        // Given
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .email("integration@test.com")
            .password("StrongPass123!")
            .firstName("Integration")
            .lastName("Test")
            .build();
            
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<UserRegistrationRequest> entity = new HttpEntity<>(request, headers);
        
        // When
        ResponseEntity<UserResponse> response = restTemplate.postForEntity(
            "/api/v1/users/register", entity, UserResponse.class);
        
        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getEmail()).isEqualTo(request.getEmail());
        
        // Verify user is saved in database
        Optional<User> savedUser = userRepository.findByEmail(request.getEmail());
        assertThat(savedUser).isPresent();
        assertThat(savedUser.get().getFirstName()).isEqualTo(request.getFirstName());
    }
    
    @Test
    void registerUser_DuplicateEmail_ShouldReturn409() {
        // Given
        User existingUser = User.builder()
            .userId(UUID.randomUUID())
            .email("duplicate@test.com")
            .password("encodedPassword")
            .firstName("Existing")
            .lastName("User")
            .role(UserRole.CONSUMER)
            .isActive(true)
            .createdAt(LocalDateTime.now())
            .updatedAt(LocalDateTime.now())
            .build();
        userRepository.save(existingUser);
        
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .email("duplicate@test.com")
            .password("StrongPass123!")
            .firstName("Duplicate")
            .lastName("Test")
            .build();
            
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<UserRegistrationRequest> entity = new HttpEntity<>(request, headers);
        
        // When
        ResponseEntity<ErrorResponse> response = restTemplate.postForEntity(
            "/api/v1/users/register", entity, ErrorResponse.class);
        
        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getMessage()).contains("Email already exists");
    }
}
```

### Performance Tests
```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PerformanceTest {
    
    @Autowired
    private TestRestTemplate restTemplate;
    
    @Test
    void productSearch_ConcurrentRequests_ShouldMaintainPerformance() throws InterruptedException {
        int numberOfThreads = 50;
        int requestsPerThread = 20;
        CountDownLatch latch = new CountDownLatch(numberOfThreads);
        List<Long> responseTimes = Collections.synchronizedList(new ArrayList<>());
        
        ExecutorService executor = Executors.newFixedThreadPool(numberOfThreads);
        
        for (int i = 0; i < numberOfThreads; i++) {
            executor.submit(() -> {
                try {
                    for (int j = 0; j < requestsPerThread; j++) {
                        long startTime = System.currentTimeMillis();
                        
                        ResponseEntity<String> response = restTemplate.getForEntity(
                            "/api/v1/products?page=0&size=20&search=laptop", String.class);
                        
                        long endTime = System.currentTimeMillis();
                        responseTimes.add(endTime - startTime);
                        
                        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                    }
                } finally {
                    latch.countDown();
                }
            });
        }
        
        latch.await(30, TimeUnit.SECONDS);
        executor.shutdown();
        
        // Assert performance metrics
        double averageResponseTime = responseTimes.stream()
            .mapToLong(Long::longValue)
            .average()
            .orElse(0.0);
            
        long maxResponseTime = responseTimes.stream()
            .mapToLong(Long::longValue)
            .max()
            .orElse(0L);
            
        assertThat(averageResponseTime).isLessThan(500); // Average response time < 500ms
        assertThat(maxResponseTime).isLessThan(2000);    // Max response time < 2s
        assertThat(responseTimes.size()).isEqualTo(numberOfThreads * requestsPerThread);
    }
}
```

This comprehensive Low-Level Design document provides detailed implementation specifications, including component structures, data flows, sequence diagrams, database schemas, API specifications, security implementations, error handling strategies, and testing approaches for the online shopping platform based on the HLD requirements.