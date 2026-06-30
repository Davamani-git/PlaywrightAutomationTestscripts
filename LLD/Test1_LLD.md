# Online Shopping Platform - Low-Level Design Document

## TABLE OF CONTENTS
1. [Component Specifications](#component-specifications)
2. [Data Flow Diagrams](#data-flow-diagrams)
3. [Sequence Diagrams](#sequence-diagrams)
4. [Database Design](#database-design)
5. [API Specifications](#api-specifications)
6. [Implementation Details](#implementation-details)
7. [Security Implementation](#security-implementation)
8. [Performance Optimization](#performance-optimization)

## COMPONENT SPECIFICATIONS

### 1. User Management Service

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

public enum UserRole {
    CONSUMER, SELLER, ADMIN
}
```

#### Service Implementation
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
    
    @Autowired
    private EmailService emailService;
    
    public UserRegistrationResponse registerUser(UserRegistrationRequest request) {
        validateUserRegistration(request);
        
        User user = new User();
        user.setEmail(request.getEmail());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setFirstName(request.getFirstName());
        user.setLastName(request.getLastName());
        user.setPhone(request.getPhone());
        user.setRole(UserRole.CONSUMER);
        
        User savedUser = userRepository.save(user);
        
        // Send verification email
        emailService.sendVerificationEmail(savedUser);
        
        return new UserRegistrationResponse(savedUser.getUserId(), "Registration successful");
    }
    
    public AuthenticationResponse authenticateUser(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new InvalidCredentialsException("Invalid credentials"));
            
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            handleFailedLogin(user);
            throw new InvalidCredentialsException("Invalid credentials");
        }
        
        if (!user.getIsActive()) {
            throw new AccountLockedException("Account is locked");
        }
        
        String accessToken = tokenProvider.generateAccessToken(user);
        String refreshToken = tokenProvider.generateRefreshToken(user);
        
        return new AuthenticationResponse(accessToken, refreshToken, user.getRole());
    }
    
    private void handleFailedLogin(User user) {
        // Implement account lockout logic
        int failedAttempts = getFailedLoginAttempts(user.getUserId());
        if (failedAttempts >= 5) {
            user.setIsActive(false);
            userRepository.save(user);
        }
    }
}
```

### 2. Product Catalog Service

#### Product Entity
```java
@Entity
@Table(name = "products")
@Document(indexName = "products")
public class Product {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID productId;
    
    @Column(nullable = false)
    @Field(type = FieldType.Text, analyzer = "standard")
    private String name;
    
    @Column(columnDefinition = "TEXT")
    @Field(type = FieldType.Text)
    private String description;
    
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;
    
    @ElementCollection
    @CollectionTable(name = "product_images")
    private List<String> imageUrls;
    
    @Column(nullable = false)
    private Integer inventory;
    
    @Column(nullable = false)
    private UUID sellerId;
    
    @Column(nullable = false)
    private Boolean isActive = true;
    
    @CreationTimestamp
    private LocalDateTime createdAt;
    
    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
```

#### Search Service Implementation
```java
@Service
public class ProductSearchService {
    
    @Autowired
    private ElasticsearchRestTemplate elasticsearchTemplate;
    
    @Autowired
    private ProductRepository productRepository;
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    public ProductSearchResponse searchProducts(ProductSearchRequest request) {
        String cacheKey = generateCacheKey(request);
        
        // Check cache first
        ProductSearchResponse cachedResult = (ProductSearchResponse) 
            redisTemplate.opsForValue().get(cacheKey);
        if (cachedResult != null) {
            return cachedResult;
        }
        
        // Build Elasticsearch query
        BoolQueryBuilder queryBuilder = QueryBuilders.boolQuery();
        
        if (StringUtils.hasText(request.getSearchTerm())) {
            queryBuilder.must(QueryBuilders.multiMatchQuery(
                request.getSearchTerm(), "name", "description")
                .type(MultiMatchQueryBuilder.Type.BEST_FIELDS)
                .fuzziness(Fuzziness.AUTO));
        }
        
        if (request.getCategoryId() != null) {
            queryBuilder.filter(QueryBuilders.termQuery("category.categoryId", request.getCategoryId()));
        }
        
        if (request.getMinPrice() != null || request.getMaxPrice() != null) {
            RangeQueryBuilder priceRange = QueryBuilders.rangeQuery("price");
            if (request.getMinPrice() != null) {
                priceRange.gte(request.getMinPrice());
            }
            if (request.getMaxPrice() != null) {
                priceRange.lte(request.getMaxPrice());
            }
            queryBuilder.filter(priceRange);
        }
        
        queryBuilder.filter(QueryBuilders.termQuery("isActive", true));
        
        // Add sorting
        SortBuilder<?> sortBuilder = getSortBuilder(request.getSortBy(), request.getSortOrder());
        
        // Execute search
        NativeSearchQuery searchQuery = new NativeSearchQueryBuilder()
            .withQuery(queryBuilder)
            .withSort(sortBuilder)
            .withPageable(PageRequest.of(request.getPage(), request.getSize()))
            .build();
        
        SearchHits<Product> searchHits = elasticsearchTemplate.search(searchQuery, Product.class);
        
        List<ProductDto> products = searchHits.getSearchHits().stream()
            .map(hit -> convertToDto(hit.getContent()))
            .collect(Collectors.toList());
        
        ProductSearchResponse response = new ProductSearchResponse(
            products, 
            searchHits.getTotalHits(),
            request.getPage(),
            request.getSize()
        );
        
        // Cache the result
        redisTemplate.opsForValue().set(cacheKey, response, Duration.ofMinutes(15));
        
        return response;
    }
}
```

### 3. Order Management Service

#### Order State Machine
```java
@Entity
@Table(name = "orders")
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID orderId;
    
    @Column(nullable = false)
    private UUID userId;
    
    @Column(nullable = false)
    private LocalDateTime orderDate;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderStatus status;
    
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal totalAmount;
    
    @Enumerated(EnumType.STRING)
    private PaymentStatus paymentStatus;
    
    @Embedded
    private ShippingAddress shippingAddress;
    
    private String trackingNumber;
    
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<OrderItem> orderItems;
    
    @CreationTimestamp
    private LocalDateTime createdAt;
    
    @UpdateTimestamp
    private LocalDateTime updatedAt;
}

public enum OrderStatus {
    PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED, REFUNDED
}

public enum PaymentStatus {
    PENDING, AUTHORIZED, CAPTURED, FAILED, REFUNDED
}
```

#### Order Service Implementation
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
    private InventoryService inventoryService;
    
    @Autowired
    private NotificationService notificationService;
    
    @Autowired
    private ApplicationEventPublisher eventPublisher;
    
    public OrderResponse createOrder(CreateOrderRequest request) {
        // Validate order items and check inventory
        validateOrderItems(request.getOrderItems());
        
        // Reserve inventory
        List<InventoryReservation> reservations = reserveInventory(request.getOrderItems());
        
        try {
            // Create order
            Order order = new Order();
            order.setUserId(request.getUserId());
            order.setOrderDate(LocalDateTime.now());
            order.setStatus(OrderStatus.PENDING);
            order.setPaymentStatus(PaymentStatus.PENDING);
            order.setShippingAddress(request.getShippingAddress());
            
            // Calculate total amount
            BigDecimal totalAmount = calculateTotalAmount(request.getOrderItems());
            order.setTotalAmount(totalAmount);
            
            // Create order items
            List<OrderItem> orderItems = createOrderItems(request.getOrderItems(), order);
            order.setOrderItems(orderItems);
            
            Order savedOrder = orderRepository.save(order);
            
            // Process payment
            PaymentRequest paymentRequest = new PaymentRequest(
                savedOrder.getOrderId(),
                totalAmount,
                request.getPaymentMethod(),
                request.getPaymentDetails()
            );
            
            PaymentResponse paymentResponse = paymentService.processPayment(paymentRequest);
            
            if (paymentResponse.isSuccessful()) {
                savedOrder.setStatus(OrderStatus.CONFIRMED);
                savedOrder.setPaymentStatus(PaymentStatus.CAPTURED);
                orderRepository.save(savedOrder);
                
                // Commit inventory reservations
                inventoryService.commitReservations(reservations);
                
                // Publish order confirmed event
                eventPublisher.publishEvent(new OrderConfirmedEvent(savedOrder));
                
                // Send confirmation notification
                notificationService.sendOrderConfirmation(savedOrder);
            } else {
                // Release inventory reservations
                inventoryService.releaseReservations(reservations);
                throw new PaymentProcessingException("Payment failed: " + paymentResponse.getErrorMessage());
            }
            
            return new OrderResponse(savedOrder);
            
        } catch (Exception e) {
            // Release inventory reservations on any error
            inventoryService.releaseReservations(reservations);
            throw e;
        }
    }
    
    @EventListener
    public void handleOrderConfirmed(OrderConfirmedEvent event) {
        // Start fulfillment process
        fulfillmentService.initiateOrderFulfillment(event.getOrder());
    }
}
```

## DATA FLOW DIAGRAMS

### User Registration Flow
```
User Input → Validation → Password Hashing → Database Storage → Email Verification
    ↓
Validation Rules:
- Email format validation
- Password strength check
- Phone number format
- Duplicate email check
    ↓
Security Measures:
- bcrypt with salt (cost factor 12)
- Input sanitization
- Rate limiting (5 attempts per minute)
```

### Product Search Flow
```
Search Request → Cache Check → Elasticsearch Query → Result Aggregation → Response
       ↓              ↓              ↓                    ↓
   Rate Limit    Redis Cache    Index Search        Result Ranking
   Validation    (15 min TTL)   + Filtering         + Pagination
```

### Order Processing Flow
```
Order Request → Inventory Check → Payment Processing → Order Creation → Fulfillment
      ↓               ↓                  ↓                 ↓              ↓
  Validation    Reserve Items      Gateway Call      Database Save   Shipping API
  Cart Items    (2 min hold)      + Fraud Check     + Event Pub     + Tracking
```

## SEQUENCE DIAGRAMS

### User Authentication Sequence
```
Client → API Gateway → Auth Service → Database → JWT Service → Client
   |         |             |           |           |          |
   |---------|-------------|-----------|-----------|----------|
   | POST    |             |           |           |          |
   | /login  |   Forward   |   Query   |  Return   | Generate |  Return
   |         |   Request   |   User    |   User    |   JWT    |  Tokens
   |         |             |           |           |          |
```

### Order Creation Sequence
```
Client → Order Service → Inventory Service → Payment Service → Notification Service
   |          |               |                  |                |
   |----------|---------------|------------------|----------------|
   | POST     |               |                  |                |
   | /orders  | Reserve Items | Process Payment  | Send Email     |
   |          | (Sync)        | (Async)          | (Async)        |
   |          |               |                  |                |
   |          | ← Confirm     | ← Success        | ← Delivered    |
   |          |   Reservation |   Response       |   Status       |
```

## DATABASE DESIGN

### Primary Database Schema (PostgreSQL)

```sql
-- Users table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(20) NOT NULL DEFAULT 'CONSUMER',
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    category_id UUID NOT NULL REFERENCES categories(category_id),
    inventory INTEGER NOT NULL DEFAULT 0,
    seller_id UUID NOT NULL REFERENCES users(user_id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Product images table
CREATE TABLE product_images (
    image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(product_id),
    image_url VARCHAR(500) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Shopping carts table
CREATE TABLE shopping_carts (
    cart_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Cart items table
CREATE TABLE cart_items (
    cart_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES shopping_carts(cart_id),
    product_id UUID NOT NULL REFERENCES products(product_id),
    quantity INTEGER NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    order_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    payment_status VARCHAR(20),
    shipping_address JSONB NOT NULL,
    tracking_number VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Order items table
CREATE TABLE order_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id),
    product_id UUID NOT NULL REFERENCES products(product_id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL
);

-- Payments table
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id),
    amount DECIMAL(10,2) NOT NULL,
    method VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    transaction_id VARCHAR(255),
    gateway_reference VARCHAR(255),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Reviews table
CREATE TABLE reviews (
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(product_id),
    user_id UUID NOT NULL REFERENCES users(user_id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes for Performance
```sql
-- User indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);

-- Product indexes
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_name_gin ON products USING gin(to_tsvector('english', name));
CREATE INDEX idx_products_description_gin ON products USING gin(to_tsvector('english', description));

-- Order indexes
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(order_date);

-- Cart indexes
CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX idx_cart_items_product ON cart_items(product_id);

-- Review indexes
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);

-- Notification indexes
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
```

## API SPECIFICATIONS

### Authentication APIs

```yaml
# User Registration
POST /api/v1/auth/register
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
  "userId": "uuid",
  "message": "Registration successful. Please verify your email.",
  "timestamp": "2024-01-01T12:00:00Z"
}

# User Login
POST /api/v1/auth/login
Content-Type: application/json

Request Body:
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

Response (200 OK):
{
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "userRole": "CONSUMER"
}
```

### Product APIs

```yaml
# Product Search
GET /api/v1/products/search
Authorization: Bearer {token}

Query Parameters:
- q: search term (optional)
- category: category ID (optional)
- minPrice: minimum price (optional)
- maxPrice: maximum price (optional)
- sortBy: name|price|rating|date (default: relevance)
- sortOrder: asc|desc (default: desc)
- page: page number (default: 0)
- size: page size (default: 20)

Response (200 OK):
{
  "products": [
    {
      "productId": "uuid",
      "name": "Product Name",
      "description": "Product description",
      "price": 99.99,
      "category": {
        "categoryId": "uuid",
        "name": "Category Name"
      },
      "imageUrls": ["url1", "url2"],
      "inventory": 50,
      "averageRating": 4.5,
      "reviewCount": 123
    }
  ],
  "totalElements": 500,
  "totalPages": 25,
  "currentPage": 0,
  "pageSize": 20
}

# Get Product Details
GET /api/v1/products/{productId}
Authorization: Bearer {token}

Response (200 OK):
{
  "productId": "uuid",
  "name": "Product Name",
  "description": "Detailed product description",
  "price": 99.99,
  "category": {
    "categoryId": "uuid",
    "name": "Category Name",
    "parentCategory": "Parent Category"
  },
  "imageUrls": ["url1", "url2", "url3"],
  "inventory": 50,
  "seller": {
    "sellerId": "uuid",
    "name": "Seller Name",
    "rating": 4.8
  },
  "specifications": {
    "brand": "Brand Name",
    "model": "Model Number",
    "warranty": "1 year"
  },
  "averageRating": 4.5,
  "reviewCount": 123,
  "reviews": [
    {
      "reviewId": "uuid",
      "userId": "uuid",
      "userName": "Reviewer Name",
      "rating": 5,
      "comment": "Great product!",
      "createdAt": "2024-01-01T12:00:00Z",
      "isVerified": true
    }
  ]
}
```

### Order APIs

```yaml
# Create Order
POST /api/v1/orders
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "orderItems": [
    {
      "productId": "uuid",
      "quantity": 2
    }
  ],
  "shippingAddress": {
    "street": "123 Main St",
    "city": "Anytown",
    "state": "ST",
    "zipCode": "12345",
    "country": "US"
  },
  "paymentMethod": "CREDIT_CARD",
  "paymentDetails": {
    "cardToken": "secure-card-token",
    "billingAddress": {
      "street": "123 Main St",
      "city": "Anytown",
      "state": "ST",
      "zipCode": "12345",
      "country": "US"
    }
  }
}

Response (201 Created):
{
  "orderId": "uuid",
  "orderNumber": "ORD-2024-001234",
  "status": "CONFIRMED",
  "totalAmount": 199.98,
  "estimatedDelivery": "2024-01-05T00:00:00Z",
  "trackingNumber": "TRK123456789"
}

# Get Order Status
GET /api/v1/orders/{orderId}
Authorization: Bearer {token}

Response (200 OK):
{
  "orderId": "uuid",
  "orderNumber": "ORD-2024-001234",
  "status": "SHIPPED",
  "paymentStatus": "CAPTURED",
  "orderDate": "2024-01-01T12:00:00Z",
  "totalAmount": 199.98,
  "shippingAddress": {
    "street": "123 Main St",
    "city": "Anytown",
    "state": "ST",
    "zipCode": "12345",
    "country": "US"
  },
  "trackingNumber": "TRK123456789",
  "estimatedDelivery": "2024-01-05T00:00:00Z",
  "orderItems": [
    {
      "productId": "uuid",
      "productName": "Product Name",
      "quantity": 2,
      "unitPrice": 99.99,
      "totalPrice": 199.98
    }
  ],
  "orderHistory": [
    {
      "status": "CONFIRMED",
      "timestamp": "2024-01-01T12:00:00Z",
      "description": "Order confirmed and payment processed"
    },
    {
      "status": "PROCESSING",
      "timestamp": "2024-01-02T10:00:00Z",
      "description": "Order is being prepared for shipment"
    },
    {
      "status": "SHIPPED",
      "timestamp": "2024-01-03T14:00:00Z",
      "description": "Order shipped with tracking number TRK123456789"
    }
  ]
}
```

## IMPLEMENTATION DETAILS

### Configuration Management

```yaml
# application.yml
spring:
  application:
    name: online-shopping-platform
  
  datasource:
    url: jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:shopping_db}
    username: ${DB_USERNAME:postgres}
    password: ${DB_PASSWORD:password}
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
        jdbc:
          batch_size: 25
        order_inserts: true
        order_updates: true
  
  redis:
    host: ${REDIS_HOST:localhost}
    port: ${REDIS_PORT:6379}
    password: ${REDIS_PASSWORD:}
    timeout: 2000ms
    jedis:
      pool:
        max-active: 8
        max-idle: 8
        min-idle: 0
  
  elasticsearch:
    uris: ${ELASTICSEARCH_URIS:http://localhost:9200}
    username: ${ELASTICSEARCH_USERNAME:}
    password: ${ELASTICSEARCH_PASSWORD:}
  
  rabbitmq:
    host: ${RABBITMQ_HOST:localhost}
    port: ${RABBITMQ_PORT:5672}
    username: ${RABBITMQ_USERNAME:guest}
    password: ${RABBITMQ_PASSWORD:guest}

app:
  jwt:
    secret: ${JWT_SECRET:mySecretKey}
    access-token-expiration: 3600000  # 1 hour
    refresh-token-expiration: 604800000  # 7 days
  
  payment:
    stripe:
      api-key: ${STRIPE_API_KEY}
      webhook-secret: ${STRIPE_WEBHOOK_SECRET}
    paypal:
      client-id: ${PAYPAL_CLIENT_ID}
      client-secret: ${PAYPAL_CLIENT_SECRET}
      mode: ${PAYPAL_MODE:sandbox}
  
  email:
    sendgrid:
      api-key: ${SENDGRID_API_KEY}
      from-email: ${FROM_EMAIL:noreply@shoppingplatform.com}
  
  storage:
    aws:
      s3:
        bucket: ${AWS_S3_BUCKET:shopping-platform-images}
        region: ${AWS_REGION:us-east-1}
        access-key: ${AWS_ACCESS_KEY}
        secret-key: ${AWS_SECRET_KEY}

logging:
  level:
    com.shoppingplatform: DEBUG
    org.springframework.security: DEBUG
    org.hibernate.SQL: DEBUG
  pattern:
    console: "%d{yyyy-MM-dd HH:mm:ss} - %msg%n"
    file: "%d{yyyy-MM-dd HH:mm:ss} [%thread] %-5level %logger{36} - %msg%n"
  file:
    name: logs/application.log
    max-size: 10MB
    max-history: 30
```

### Security Configuration

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
                .requestMatchers("/api/v1/auth/**").permitAll()
                .requestMatchers("/api/v1/products/search").permitAll()
                .requestMatchers("/api/v1/products/{id}").permitAll()
                .requestMatchers("/api/v1/categories/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/reviews/**").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/v1/seller/**").hasAnyRole("SELLER", "ADMIN")
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
    
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(Arrays.asList("*"));
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(Arrays.asList("*"));
        configuration.setAllowCredentials(true);
        
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }
}
```

### Exception Handling

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    
    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(ValidationException ex) {
        logger.warn("Validation error: {}", ex.getMessage());
        
        ErrorResponse error = new ErrorResponse(
            "VALIDATION_ERROR",
            ex.getMessage(),
            LocalDateTime.now()
        );
        
        return ResponseEntity.badRequest().body(error);
    }
    
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleResourceNotFoundException(ResourceNotFoundException ex) {
        logger.warn("Resource not found: {}", ex.getMessage());
        
        ErrorResponse error = new ErrorResponse(
            "RESOURCE_NOT_FOUND",
            ex.getMessage(),
            LocalDateTime.now()
        );
        
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }
    
    @ExceptionHandler(PaymentProcessingException.class)
    public ResponseEntity<ErrorResponse> handlePaymentException(PaymentProcessingException ex) {
        logger.error("Payment processing error: {}", ex.getMessage(), ex);
        
        ErrorResponse error = new ErrorResponse(
            "PAYMENT_ERROR",
            "Payment processing failed. Please try again.",
            LocalDateTime.now()
        );
        
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(error);
    }
    
    @ExceptionHandler(InsufficientInventoryException.class)
    public ResponseEntity<ErrorResponse> handleInventoryException(InsufficientInventoryException ex) {
        logger.warn("Insufficient inventory: {}", ex.getMessage());
        
        ErrorResponse error = new ErrorResponse(
            "INSUFFICIENT_INVENTORY",
            ex.getMessage(),
            LocalDateTime.now()
        );
        
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }
    
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(Exception ex) {
        logger.error("Unexpected error occurred", ex);
        
        ErrorResponse error = new ErrorResponse(
            "INTERNAL_SERVER_ERROR",
            "An unexpected error occurred. Please try again later.",
            LocalDateTime.now()
        );
        
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }
}

public class ErrorResponse {
    private String errorCode;
    private String message;
    private LocalDateTime timestamp;
    
    // Constructors, getters, setters
}
```

## SECURITY IMPLEMENTATION

### JWT Token Management

```java
@Component
public class JwtTokenProvider {
    
    private static final Logger logger = LoggerFactory.getLogger(JwtTokenProvider.class);
    
    @Value("${app.jwt.secret}")
    private String jwtSecret;
    
    @Value("${app.jwt.access-token-expiration}")
    private long accessTokenExpiration;
    
    @Value("${app.jwt.refresh-token-expiration}")
    private long refreshTokenExpiration;
    
    private final RedisTemplate<String, Object> redisTemplate;
    
    public JwtTokenProvider(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }
    
    public String generateAccessToken(User user) {
        Date expiryDate = new Date(System.currentTimeMillis() + accessTokenExpiration);
        
        return Jwts.builder()
            .setSubject(user.getUserId().toString())
            .setIssuedAt(new Date())
            .setExpiration(expiryDate)
            .claim("email", user.getEmail())
            .claim("role", user.getRole().name())
            .claim("type", "ACCESS")
            .signWith(SignatureAlgorithm.HS512, jwtSecret)
            .compact();
    }
    
    public String generateRefreshToken(User user) {
        Date expiryDate = new Date(System.currentTimeMillis() + refreshTokenExpiration);
        String tokenId = UUID.randomUUID().toString();
        
        String refreshToken = Jwts.builder()
            .setSubject(user.getUserId().toString())
            .setId(tokenId)
            .setIssuedAt(new Date())
            .setExpiration(expiryDate)
            .claim("type", "REFRESH")
            .signWith(SignatureAlgorithm.HS512, jwtSecret)
            .compact();
        
        // Store refresh token in Redis
        String redisKey = "refresh_token:" + user.getUserId();
        redisTemplate.opsForValue().set(redisKey, tokenId, Duration.ofMillis(refreshTokenExpiration));
        
        return refreshToken;
    }
    
    public boolean validateToken(String token) {
        try {
            Claims claims = Jwts.parser()
                .setSigningKey(jwtSecret)
                .parseClaimsJws(token)
                .getBody();
            
            // Check if token is blacklisted
            String tokenId = claims.getId();
            if (tokenId != null && isTokenBlacklisted(tokenId)) {
                return false;
            }
            
            return true;
        } catch (SignatureException ex) {
            logger.error("Invalid JWT signature: {}", ex.getMessage());
        } catch (MalformedJwtException ex) {
            logger.error("Invalid JWT token: {}", ex.getMessage());
        } catch (ExpiredJwtException ex) {
            logger.error("Expired JWT token: {}", ex.getMessage());
        } catch (UnsupportedJwtException ex) {
            logger.error("Unsupported JWT token: {}", ex.getMessage());
        } catch (IllegalArgumentException ex) {
            logger.error("JWT claims string is empty: {}", ex.getMessage());
        }
        
        return false;
    }
    
    private boolean isTokenBlacklisted(String tokenId) {
        return redisTemplate.hasKey("blacklist:" + tokenId);
    }
    
    public void blacklistToken(String token) {
        try {
            Claims claims = Jwts.parser()
                .setSigningKey(jwtSecret)
                .parseClaimsJws(token)
                .getBody();
            
            String tokenId = claims.getId();
            if (tokenId != null) {
                long remainingTime = claims.getExpiration().getTime() - System.currentTimeMillis();
                if (remainingTime > 0) {
                    redisTemplate.opsForValue().set(
                        "blacklist:" + tokenId, 
                        true, 
                        Duration.ofMillis(remainingTime)
                    );
                }
            }
        } catch (Exception ex) {
            logger.error("Error blacklisting token: {}", ex.getMessage());
        }
    }
}
```

### Input Validation and Sanitization

```java
@Component
public class InputValidator {
    
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
        "^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"
    );
    
    private static final Pattern PHONE_PATTERN = Pattern.compile(
        "^\\+?[1-9]\\d{1,14}$"
    );
    
    private static final Pattern PASSWORD_PATTERN = Pattern.compile(
        "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$"
    );
    
    public void validateEmail(String email) {
        if (email == null || !EMAIL_PATTERN.matcher(email).matches()) {
            throw new ValidationException("Invalid email format");
        }
    }
    
    public void validatePassword(String password) {
        if (password == null || !PASSWORD_PATTERN.matcher(password).matches()) {
            throw new ValidationException(
                "Password must be at least 8 characters long and contain at least one uppercase letter, " +
                "one lowercase letter, one digit, and one special character"
            );
        }
    }
    
    public void validatePhone(String phone) {
        if (phone != null && !phone.isEmpty() && !PHONE_PATTERN.matcher(phone).matches()) {
            throw new ValidationException("Invalid phone number format");
        }
    }
    
    public String sanitizeInput(String input) {
        if (input == null) {
            return null;
        }
        
        // Remove potentially dangerous characters
        return input.replaceAll("[<>\"'%;()&+]", "").trim();
    }
    
    public String sanitizeHtml(String html) {
        if (html == null) {
            return null;
        }
        
        // Use OWASP Java HTML Sanitizer
        PolicyFactory policy = new HtmlPolicyBuilder()
            .allowElements("b", "i", "u", "strong", "em", "p", "br")
            .toFactory();
        
        return policy.sanitize(html);
    }
}
```

## PERFORMANCE OPTIMIZATION

### Caching Strategy

```java
@Configuration
@EnableCaching
public class CacheConfig {
    
    @Bean
    public CacheManager cacheManager(RedisConnectionFactory redisConnectionFactory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(15))
            .serializeKeysWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()));
        
        Map<String, RedisCacheConfiguration> cacheConfigurations = new HashMap<>();
        
        // Product cache - longer TTL
        cacheConfigurations.put("products", config.entryTtl(Duration.ofHours(1)));
        
        // Category cache - very long TTL
        cacheConfigurations.put("categories", config.entryTtl(Duration.ofHours(6)));
        
        // User cache - shorter TTL
        cacheConfigurations.put("users", config.entryTtl(Duration.ofMinutes(30)));
        
        // Search results cache - short TTL
        cacheConfigurations.put("search", config.entryTtl(Duration.ofMinutes(5)));
        
        return RedisCacheManager.builder(redisConnectionFactory)
            .cacheDefaults(config)
            .withInitialCacheConfigurations(cacheConfigurations)
            .build();
    }
}

@Service
public class ProductCacheService {
    
    @Cacheable(value = "products", key = "#productId")
    public ProductDto getProduct(UUID productId) {
        // This will be cached
        return productService.getProductById(productId);
    }
    
    @Cacheable(value = "search", key = "#request.hashCode()")
    public ProductSearchResponse searchProducts(ProductSearchRequest request) {
        // Search results will be cached
        return productSearchService.searchProducts(request);
    }
    
    @CacheEvict(value = "products", key = "#productId")
    public void evictProduct(UUID productId) {
        // Remove product from cache when updated
    }
    
    @CacheEvict(value = "search", allEntries = true)
    public void evictSearchCache() {
        // Clear all search cache when products are updated
    }
}
```

### Database Optimization

```java
@Repository
public class ProductRepositoryImpl implements ProductRepositoryCustom {
    
    @PersistenceContext
    private EntityManager entityManager;
    
    @Override
    public Page<Product> findProductsWithFilters(
            ProductSearchCriteria criteria, Pageable pageable) {
        
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Product> query = cb.createQuery(Product.class);
        Root<Product> product = query.from(Product.class);
        
        List<Predicate> predicates = new ArrayList<>();
        
        // Add filters
        if (criteria.getCategoryId() != null) {
            predicates.add(cb.equal(product.get("category").get("categoryId"), criteria.getCategoryId()));
        }
        
        if (criteria.getMinPrice() != null) {
            predicates.add(cb.greaterThanOrEqualTo(product.get("price"), criteria.getMinPrice()));
        }
        
        if (criteria.getMaxPrice() != null) {
            predicates.add(cb.lessThanOrEqualTo(product.get("price"), criteria.getMaxPrice()));
        }
        
        predicates.add(cb.equal(product.get("isActive"), true));
        
        query.where(predicates.toArray(new Predicate[0]));
        
        // Add sorting
        if (pageable.getSort().isSorted()) {
            List<Order> orders = new ArrayList<>();
            for (Sort.Order sortOrder : pageable.getSort()) {
                if (sortOrder.isAscending()) {
                    orders.add(cb.asc(product.get(sortOrder.getProperty())));
                } else {
                    orders.add(cb.desc(product.get(sortOrder.getProperty())));
                }
            }
            query.orderBy(orders);
        }
        
        TypedQuery<Product> typedQuery = entityManager.createQuery(query);
        typedQuery.setFirstResult((int) pageable.getOffset());
        typedQuery.setMaxResults(pageable.getPageSize());
        
        List<Product> products = typedQuery.getResultList();
        
        // Count query for pagination
        CriteriaQuery<Long> countQuery = cb.createQuery(Long.class);
        Root<Product> countRoot = countQuery.from(Product.class);
        countQuery.select(cb.count(countRoot));
        countQuery.where(predicates.toArray(new Predicate[0]));
        
        Long total = entityManager.createQuery(countQuery).getSingleResult();
        
        return new PageImpl<>(products, pageable, total);
    }
}
```

### Async Processing

```java
@Configuration
@EnableAsync
public class AsyncConfig {
    
    @Bean(name = "taskExecutor")
    public TaskExecutor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);
        executor.setMaxPoolSize(20);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("async-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }
}

@Service
public class NotificationService {
    
    @Async("taskExecutor")
    public CompletableFuture<Void> sendOrderConfirmationEmail(Order order) {
        try {
            // Send email asynchronously
            emailService.sendOrderConfirmation(order);
            logger.info("Order confirmation email sent for order: {}", order.getOrderId());
        } catch (Exception e) {
            logger.error("Failed to send order confirmation email for order: {}", order.getOrderId(), e);
        }
        return CompletableFuture.completedFuture(null);
    }
    
    @Async("taskExecutor")
    public CompletableFuture<Void> sendInventoryAlert(UUID productId, int currentInventory) {
        try {
            if (currentInventory < 10) {
                // Send low inventory alert
                alertService.sendLowInventoryAlert(productId, currentInventory);
            }
        } catch (Exception e) {
            logger.error("Failed to send inventory alert for product: {}", productId, e);
        }
        return CompletableFuture.completedFuture(null);
    }
}
```

This comprehensive Low-Level Design document provides detailed implementation specifications, database schemas, API definitions, security measures, and performance optimizations for the Online Shopping Platform based on the HLD requirements.