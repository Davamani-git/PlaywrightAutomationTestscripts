# Online Shopping Platform - Low-Level Design Document

## 1. Component Specifications

### 1.1 API Gateway Component

#### Class Definition
```java
@Component
@RestController
@RequestMapping("/api/v1")
public class ApiGatewayController {
    
    @Autowired
    private AuthenticationService authService;
    
    @Autowired
    private RateLimitingService rateLimitService;
    
    @Autowired
    private RequestValidationService validationService;
    
    @PostMapping("/authenticate")
    public ResponseEntity<AuthResponse> authenticate(
            @Valid @RequestBody AuthRequest request) {
        
        // Rate limiting check
        if (!rateLimitService.isAllowed(request.getClientId())) {
            throw new RateLimitExceededException("Rate limit exceeded");
        }
        
        // Input validation
        validationService.validateAuthRequest(request);
        
        // Authentication
        AuthResponse response = authService.authenticate(request);
        
        return ResponseEntity.ok(response);
    }
}

@Entity
@Table(name = "api_requests")
public class ApiRequest {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID requestId;
    
    @Column(nullable = false)
    private String clientId;
    
    @Column(nullable = false)
    private String endpoint;
    
    @Column(nullable = false)
    private LocalDateTime timestamp;
    
    @Column(nullable = false)
    private String httpMethod;
    
    @Column
    private String userAgent;
    
    @Column
    private String ipAddress;
    
    // Constructors, getters, setters
}
```

#### Configuration
```yaml
api:
  gateway:
    rate-limiting:
      requests-per-minute: 1000
      burst-capacity: 100
    security:
      jwt-secret: ${JWT_SECRET}
      token-expiry: 900 # 15 minutes
    cors:
      allowed-origins: "https://shopping.example.com"
      allowed-methods: "GET,POST,PUT,DELETE"
      allowed-headers: "*"
```

### 1.2 User Service Component

#### Class Definition
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
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserRole role;
    
    @Column(nullable = false)
    private LocalDateTime createdAt;
    
    @Column(nullable = false)
    private Boolean isActive;
    
    @OneToOne(mappedBy = "user", cascade = CascadeType.ALL)
    private UserProfile profile;
    
    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL)
    private List<Order> orders;
    
    // Constructors, getters, setters
}

@Entity
@Table(name = "user_profiles")
public class UserProfile {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID profileId;
    
    @OneToOne
    @JoinColumn(name = "user_id")
    private User user;
    
    @Column
    @Convert(converter = EncryptedStringConverter.class)
    private String firstName;
    
    @Column
    @Convert(converter = EncryptedStringConverter.class)
    private String lastName;
    
    @Column
    @Convert(converter = EncryptedStringConverter.class)
    private String phoneNumber;
    
    @Embedded
    private Address address;
    
    // Constructors, getters, setters
}

@Service
@Transactional
public class UserService {
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private PasswordEncoder passwordEncoder;
    
    @Autowired
    private JwtTokenProvider tokenProvider;
    
    public UserRegistrationResponse registerUser(UserRegistrationRequest request) {
        // Validate input
        validateRegistrationRequest(request);
        
        // Check if user already exists
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new UserAlreadyExistsException("User with email already exists");
        }
        
        // Create user entity
        User user = new User();
        user.setEmail(request.getEmail());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setRole(UserRole.CONSUMER);
        user.setCreatedAt(LocalDateTime.now());
        user.setIsActive(true);
        
        // Save user
        User savedUser = userRepository.save(user);
        
        // Generate JWT token
        String token = tokenProvider.generateToken(savedUser);
        
        return new UserRegistrationResponse(savedUser.getUserId(), token);
    }
    
    public AuthenticationResponse authenticateUser(AuthenticationRequest request) {
        // Find user by email
        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new InvalidCredentialsException("Invalid credentials"));
        
        // Verify password
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new InvalidCredentialsException("Invalid credentials");
        }
        
        // Check if user is active
        if (!user.getIsActive()) {
            throw new AccountDeactivatedException("Account is deactivated");
        }
        
        // Generate JWT token
        String token = tokenProvider.generateToken(user);
        
        return new AuthenticationResponse(token, user.getRole());
    }
}
```

### 1.3 Product Service Component

#### Class Definition
```java
@Entity
@Table(name = "products")
@Indexed
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
    
    @Column(nullable = false)
    private UUID sellerId;
    
    @Column(nullable = false)
    @Field(type = FieldType.Keyword)
    private String category;
    
    @Column
    private String imageUrl;
    
    @Column(nullable = false)
    private Integer inventory;
    
    @Column(nullable = false)
    private Boolean isActive;
    
    @Column(nullable = false)
    private LocalDateTime createdAt;
    
    @Column(nullable = false)
    private LocalDateTime updatedAt;
    
    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL)
    private List<Review> reviews;
    
    // Constructors, getters, setters
}

@Service
@Transactional
public class ProductService {
    
    @Autowired
    private ProductRepository productRepository;
    
    @Autowired
    private ElasticsearchOperations elasticsearchOperations;
    
    @Autowired
    private InventoryService inventoryService;
    
    public ProductResponse createProduct(CreateProductRequest request) {
        // Validate input
        validateProductRequest(request);
        
        // Create product entity
        Product product = new Product();
        product.setName(request.getName());
        product.setDescription(request.getDescription());
        product.setPrice(request.getPrice());
        product.setSellerId(request.getSellerId());
        product.setCategory(request.getCategory());
        product.setImageUrl(request.getImageUrl());
        product.setInventory(request.getInitialInventory());
        product.setIsActive(true);
        product.setCreatedAt(LocalDateTime.now());
        product.setUpdatedAt(LocalDateTime.now());
        
        // Save product
        Product savedProduct = productRepository.save(product);
        
        // Index in Elasticsearch
        elasticsearchOperations.save(savedProduct);
        
        return mapToProductResponse(savedProduct);
    }
    
    public Page<ProductResponse> searchProducts(ProductSearchRequest request) {
        // Build Elasticsearch query
        BoolQueryBuilder queryBuilder = QueryBuilders.boolQuery();
        
        if (StringUtils.hasText(request.getKeyword())) {
            queryBuilder.must(QueryBuilders.multiMatchQuery(request.getKeyword(), "name", "description"));
        }
        
        if (StringUtils.hasText(request.getCategory())) {
            queryBuilder.filter(QueryBuilders.termQuery("category", request.getCategory()));
        }
        
        if (request.getMinPrice() != null) {
            queryBuilder.filter(QueryBuilders.rangeQuery("price").gte(request.getMinPrice()));
        }
        
        if (request.getMaxPrice() != null) {
            queryBuilder.filter(QueryBuilders.rangeQuery("price").lte(request.getMaxPrice()));
        }
        
        queryBuilder.filter(QueryBuilders.termQuery("isActive", true));
        
        // Execute search
        NativeSearchQuery searchQuery = new NativeSearchQueryBuilder()
            .withQuery(queryBuilder)
            .withPageable(PageRequest.of(request.getPage(), request.getSize()))
            .build();
        
        SearchHits<Product> searchHits = elasticsearchOperations.search(searchQuery, Product.class);
        
        List<ProductResponse> products = searchHits.stream()
            .map(hit -> mapToProductResponse(hit.getContent()))
            .collect(Collectors.toList());
        
        return new PageImpl<>(products, PageRequest.of(request.getPage(), request.getSize()), searchHits.getTotalHits());
    }
}
```

### 1.4 Order Service Component

#### Class Definition
```java
@Entity
@Table(name = "orders")
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID orderId;
    
    @Column(nullable = false)
    private UUID userId;
    
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal totalAmount;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderStatus status;
    
    @Column(nullable = false)
    private LocalDateTime createdAt;
    
    @Column(nullable = false)
    private LocalDateTime updatedAt;
    
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<OrderItem> orderItems;
    
    @OneToOne(mappedBy = "order", cascade = CascadeType.ALL)
    private Payment payment;
    
    @Embedded
    private ShippingAddress shippingAddress;
    
    // Constructors, getters, setters
}

@Entity
@Table(name = "order_items")
public class OrderItem {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID orderItemId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id")
    private Order order;
    
    @Column(nullable = false)
    private UUID productId;
    
    @Column(nullable = false)
    private Integer quantity;
    
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;
    
    // Constructors, getters, setters
}

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
        // Validate order request
        validateOrderRequest(request);
        
        // Check inventory availability
        for (OrderItemRequest item : request.getItems()) {
            if (!inventoryService.isAvailable(item.getProductId(), item.getQuantity())) {
                throw new InsufficientInventoryException("Insufficient inventory for product: " + item.getProductId());
            }
        }
        
        // Create order entity
        Order order = new Order();
        order.setUserId(request.getUserId());
        order.setStatus(OrderStatus.PENDING);
        order.setCreatedAt(LocalDateTime.now());
        order.setUpdatedAt(LocalDateTime.now());
        order.setShippingAddress(request.getShippingAddress());
        
        // Create order items
        List<OrderItem> orderItems = new ArrayList<>();
        BigDecimal totalAmount = BigDecimal.ZERO;
        
        for (OrderItemRequest itemRequest : request.getItems()) {
            ProductResponse product = productService.getProduct(itemRequest.getProductId());
            
            OrderItem orderItem = new OrderItem();
            orderItem.setOrder(order);
            orderItem.setProductId(itemRequest.getProductId());
            orderItem.setQuantity(itemRequest.getQuantity());
            orderItem.setPrice(product.getPrice());
            
            orderItems.add(orderItem);
            totalAmount = totalAmount.add(product.getPrice().multiply(BigDecimal.valueOf(itemRequest.getQuantity())));
        }
        
        order.setOrderItems(orderItems);
        order.setTotalAmount(totalAmount);
        
        // Save order
        Order savedOrder = orderRepository.save(order);
        
        // Reserve inventory
        for (OrderItem item : savedOrder.getOrderItems()) {
            inventoryService.reserveInventory(item.getProductId(), item.getQuantity());
        }
        
        // Publish order created event
        eventPublisher.publishEvent(new OrderCreatedEvent(savedOrder.getOrderId()));
        
        return mapToOrderResponse(savedOrder);
    }
    
    public OrderResponse updateOrderStatus(UUID orderId, OrderStatus newStatus) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException("Order not found: " + orderId));
        
        OrderStatus previousStatus = order.getStatus();
        order.setStatus(newStatus);
        order.setUpdatedAt(LocalDateTime.now());
        
        Order updatedOrder = orderRepository.save(order);
        
        // Send notification
        notificationService.sendOrderStatusNotification(order.getUserId(), orderId, newStatus);
        
        // Publish status change event
        eventPublisher.publishEvent(new OrderStatusChangedEvent(orderId, previousStatus, newStatus));
        
        return mapToOrderResponse(updatedOrder);
    }
}
```

### 1.5 Payment Service Component

#### Class Definition
```java
@Entity
@Table(name = "payments")
public class Payment {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID paymentId;
    
    @OneToOne
    @JoinColumn(name = "order_id")
    private Order order;
    
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal amount;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentMethod method;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentStatus status;
    
    @Column
    private String externalTransactionId;
    
    @Column
    private String gatewayResponse;
    
    @Column(nullable = false)
    private LocalDateTime createdAt;
    
    @Column
    private LocalDateTime processedAt;
    
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
    
    @Async
    public CompletableFuture<PaymentResponse> processPayment(ProcessPaymentRequest request) {
        try {
            // Fraud detection check
            FraudCheckResult fraudResult = fraudDetectionService.checkTransaction(request);
            if (fraudResult.isHighRisk()) {
                throw new FraudDetectedException("Transaction flagged as high risk");
            }
            
            // Create payment entity
            Payment payment = new Payment();
            payment.setOrder(orderRepository.findById(request.getOrderId())
                .orElseThrow(() -> new OrderNotFoundException("Order not found")));
            payment.setAmount(request.getAmount());
            payment.setMethod(request.getPaymentMethod());
            payment.setStatus(PaymentStatus.PROCESSING);
            payment.setCreatedAt(LocalDateTime.now());
            
            Payment savedPayment = paymentRepository.save(payment);
            
            // Process payment through gateway
            PaymentGatewayResponse gatewayResponse = processPaymentThroughGateway(request);
            
            // Update payment status
            savedPayment.setExternalTransactionId(gatewayResponse.getTransactionId());
            savedPayment.setGatewayResponse(gatewayResponse.getRawResponse());
            savedPayment.setProcessedAt(LocalDateTime.now());
            
            if (gatewayResponse.isSuccessful()) {
                savedPayment.setStatus(PaymentStatus.COMPLETED);
                eventPublisher.publishEvent(new PaymentCompletedEvent(savedPayment.getPaymentId()));
            } else {
                savedPayment.setStatus(PaymentStatus.FAILED);
                eventPublisher.publishEvent(new PaymentFailedEvent(savedPayment.getPaymentId(), gatewayResponse.getErrorMessage()));
            }
            
            Payment finalPayment = paymentRepository.save(savedPayment);
            return CompletableFuture.completedFuture(mapToPaymentResponse(finalPayment));
            
        } catch (Exception e) {
            // Handle payment processing errors
            eventPublisher.publishEvent(new PaymentErrorEvent(request.getOrderId(), e.getMessage()));
            throw new PaymentProcessingException("Payment processing failed", e);
        }
    }
    
    private PaymentGatewayResponse processPaymentThroughGateway(ProcessPaymentRequest request) {
        switch (request.getPaymentMethod()) {
            case CREDIT_CARD:
            case DEBIT_CARD:
                return stripeGateway.processPayment(request);
            case PAYPAL:
                return paypalGateway.processPayment(request);
            default:
                throw new UnsupportedPaymentMethodException("Unsupported payment method: " + request.getPaymentMethod());
        }
    }
}
```

## 2. Data Flow Diagrams

### 2.1 User Registration Flow

```
User → API Gateway → User Service → Database
  ↓         ↓            ↓            ↓
Request   Validate    Create User   Store User
  ↓         ↓            ↓            ↓
Email     Rate Limit  Hash Password  Return ID
  ↓         ↓            ↓            ↓
Password  JWT Token   Generate Token Send Response
```

### 2.2 Product Search Flow

```
User → API Gateway → Product Service → Elasticsearch → Database
  ↓         ↓            ↓              ↓              ↓
Search    Validate    Build Query    Execute Search  Get Details
  ↓         ↓            ↓              ↓              ↓
Filters   Auth Check  Apply Filters  Return Results Format Response
```

### 2.3 Order Processing Flow

```
User → API Gateway → Order Service → Inventory Service → Payment Service
  ↓         ↓            ↓              ↓                  ↓
Order     Validate    Check Stock    Reserve Items      Process Payment
  ↓         ↓            ↓              ↓                  ↓
Items     Auth        Create Order   Update Inventory   Gateway Call
  ↓         ↓            ↓              ↓                  ↓
Payment   Rate Limit  Save Order     Publish Event      Update Status
```

### 2.4 Payment Processing Flow

```
Payment Service → Fraud Detection → Payment Gateway → Database → Notification
       ↓               ↓                 ↓              ↓            ↓
   Validate        Risk Analysis     Process Card    Update Status  Send Alert
       ↓               ↓                 ↓              ↓            ↓
   Create Record   Check Rules       Gateway API     Log Transaction Email/SMS
       ↓               ↓                 ↓              ↓            ↓
   Async Process   Return Score      Return Result   Publish Event  Push Notification
```

## 3. Sequence Diagrams

### 3.1 User Authentication Sequence

```
User          API Gateway    User Service    Database      JWT Service
 |                |              |              |              |
 |   POST /auth   |              |              |              |
 |--------------->|              |              |              |
 |                | validate()   |              |              |
 |                |------------->|              |              |
 |                |              | findByEmail()|              |
 |                |              |------------->|              |
 |                |              |    User      |              |
 |                |              |<-------------|              |
 |                |              | verifyPassword()            |
 |                |              |              |              |
 |                |              | generateToken()             |
 |                |              |----------------------------->|
 |                |              |            JWT Token        |
 |                |              |<-----------------------------|
 |                |  AuthResponse|              |              |
 |                |<-------------|              |              |
 |   JWT Token    |              |              |              |
 |<---------------|              |              |              |
```

### 3.2 Order Creation Sequence

```
User     API Gateway   Order Service   Product Service   Inventory   Payment Service   Notification
 |           |              |               |               |              |               |
 |  POST     |              |               |               |              |               |
 | /orders   |              |               |               |              |               |
 |---------->|              |               |               |              |               |
 |           | createOrder()|               |               |              |               |
 |           |------------->|               |               |              |               |
 |           |              | getProduct()  |               |              |               |
 |           |              |-------------->|               |              |               |
 |           |              |   Product     |               |              |               |
 |           |              |<--------------|               |              |               |
 |           |              | checkInventory()              |              |               |
 |           |              |------------------------------>|              |               |
 |           |              |           Available          |              |               |
 |           |              |<------------------------------|              |               |
 |           |              | reserveInventory()           |              |               |
 |           |              |------------------------------>|              |               |
 |           |              | createOrder() |               |              |               |
 |           |              | (save to DB)  |               |              |               |
 |           |              |               |               |              |               |
 |           |              | processPayment()             |              |               |
 |           |              |------------------------------------------>|               |
 |           |              |                               |       PaymentResponse       |
 |           |              |<------------------------------------------|               |
 |           |              | sendNotification()                       |               |
 |           |              |--------------------------------------------------------->|
 |           | OrderResponse|               |               |              |               |
 |           |<-------------|               |               |              |               |
 |  Order    |              |               |               |              |               |
 |<----------|              |               |               |              |               |
```

### 3.3 Product Search Sequence

```
User        API Gateway    Product Service    Elasticsearch    Database    Cache
 |              |                |                 |              |          |
 | GET /search  |                |                 |              |          |
 |------------->|                |                 |              |          |
 |              | searchProducts()|                |              |          |
 |              |--------------->|                 |              |          |
 |              |                | checkCache()    |              |          |
 |              |                |------------------------------------>|
 |              |                |            Cache Miss            |          |
 |              |                |<------------------------------------|
 |              |                | buildQuery()    |              |          |
 |              |                |---------------->|              |          |
 |              |                |   SearchHits    |              |          |
 |              |                |<----------------|              |          |
 |              |                | getProductDetails()           |          |
 |              |                |------------------------------>|          |
 |              |                |         Product Details       |          |
 |              |                |<------------------------------|          |
 |              |                | cacheResults()  |              |          |
 |              |                |------------------------------------>|
 |              |  ProductList   |                 |              |          |
 |              |<---------------|                 |              |          |
 |  Results     |                |                 |              |          |
 |<-------------|                |                 |              |          |
```

## 4. Implementation Details

### 4.1 Database Schema

#### Users Table
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('CONSUMER', 'SELLER', 'ADMIN')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);
```

#### Products Table
```sql
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    seller_id UUID NOT NULL,
    category VARCHAR(100) NOT NULL,
    image_url VARCHAR(500),
    inventory INTEGER NOT NULL CHECK (inventory >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    FOREIGN KEY (seller_id) REFERENCES users(user_id)
);

CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_active ON products(is_active);
```

#### Orders Table
```sql
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    shipping_address JSONB NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
```

#### Order Items Table
```sql
CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
```

#### Payments Table
```sql
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    method VARCHAR(50) NOT NULL CHECK (method IN ('CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL', 'BANK_TRANSFER')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED')),
    external_transaction_id VARCHAR(255),
    gateway_response TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at);
```

### 4.2 API Specifications

#### Authentication Endpoints

```yaml
/api/v1/auth/register:
  post:
    summary: Register new user
    requestBody:
      required: true
      content:
        application/json:
          schema:
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
                example: "user@example.com"
              password:
                type: string
                minLength: 8
                pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$"
              firstName:
                type: string
                maxLength: 50
              lastName:
                type: string
                maxLength: 50
    responses:
      '201':
        description: User registered successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                userId:
                  type: string
                  format: uuid
                token:
                  type: string
                message:
                  type: string
      '400':
        description: Invalid input
      '409':
        description: User already exists

/api/v1/auth/login:
  post:
    summary: Authenticate user
    requestBody:
      required: true
      content:
        application/json:
          schema:
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
    responses:
      '200':
        description: Authentication successful
        content:
          application/json:
            schema:
              type: object
              properties:
                token:
                  type: string
                role:
                  type: string
                  enum: [CONSUMER, SELLER, ADMIN]
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
      - name: keyword
        in: query
        schema:
          type: string
      - name: category
        in: query
        schema:
          type: string
      - name: minPrice
        in: query
        schema:
          type: number
          format: decimal
      - name: maxPrice
        in: query
        schema:
          type: number
          format: decimal
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
          maximum: 100
    responses:
      '200':
        description: Products found
        content:
          application/json:
            schema:
              type: object
              properties:
                content:
                  type: array
                  items:
                    $ref: '#/components/schemas/Product'
                totalElements:
                  type: integer
                totalPages:
                  type: integer
                size:
                  type: integer
                number:
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
            type: object
            required:
              - name
              - description
              - price
              - category
              - initialInventory
            properties:
              name:
                type: string
                maxLength: 255
              description:
                type: string
              price:
                type: number
                format: decimal
                minimum: 0
              category:
                type: string
                maxLength: 100
              imageUrl:
                type: string
                format: uri
              initialInventory:
                type: integer
                minimum: 0
    responses:
      '201':
        description: Product created successfully
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Product'
      '400':
        description: Invalid input
      '401':
        description: Unauthorized
      '403':
        description: Forbidden - Only sellers can create products
```

#### Order Endpoints

```yaml
/api/v1/orders:
  post:
    summary: Create new order
    security:
      - bearerAuth: []
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - items
              - shippingAddress
            properties:
              items:
                type: array
                minItems: 1
                items:
                  type: object
                  required:
                    - productId
                    - quantity
                  properties:
                    productId:
                      type: string
                      format: uuid
                    quantity:
                      type: integer
                      minimum: 1
              shippingAddress:
                type: object
                required:
                  - street
                  - city
                  - state
                  - zipCode
                  - country
                properties:
                  street:
                    type: string
                  city:
                    type: string
                  state:
                    type: string
                  zipCode:
                    type: string
                  country:
                    type: string
    responses:
      '201':
        description: Order created successfully
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Order'
      '400':
        description: Invalid input
      '401':
        description: Unauthorized
      '409':
        description: Insufficient inventory

  get:
    summary: Get user orders
    security:
      - bearerAuth: []
    parameters:
      - name: status
        in: query
        schema:
          type: string
          enum: [PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED]
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
    responses:
      '200':
        description: Orders retrieved successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                content:
                  type: array
                  items:
                    $ref: '#/components/schemas/Order'
                totalElements:
                  type: integer
                totalPages:
                  type: integer
```

### 4.3 Security Implementation

#### JWT Token Configuration

```java
@Configuration
@EnableWebSecurity
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
                .requestMatchers("/api/v1/auth/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/products/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/products/**").hasRole("SELLER")
                .requestMatchers("/api/v1/orders/**").hasAnyRole("CONSUMER", "SELLER")
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .exceptionHandling().authenticationEntryPoint(jwtAuthenticationEntryPoint)
            .and()
            .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS);
        
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
    
    public boolean validateToken(String token) {
        try {
            Jwts.parser().setSigningKey(jwtSecret).parseClaimsJws(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            logger.error("Invalid JWT token: {}", e.getMessage());
            return false;
        }
    }
    
    public UUID getUserIdFromToken(String token) {
        Claims claims = Jwts.parser()
            .setSigningKey(jwtSecret)
            .parseClaimsJws(token)
            .getBody();
        
        return UUID.fromString(claims.getSubject());
    }
}
```

#### Data Encryption

```java
@Component
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
            
            ByteBuffer byteBuffer = ByteBuffer.allocate(iv.length + encryptedData.length);
            byteBuffer.put(iv);
            byteBuffer.put(encryptedData);
            
            return Base64.getEncoder().encodeToString(byteBuffer.array());
        } catch (Exception e) {
            throw new EncryptionException("Error encrypting data", e);
        }
    }
    
    public String decrypt(String encryptedText) {
        try {
            byte[] decodedData = Base64.getDecoder().decode(encryptedText);
            ByteBuffer byteBuffer = ByteBuffer.wrap(decodedData);
            
            byte[] iv = new byte[GCM_IV_LENGTH];
            byteBuffer.get(iv);
            
            byte[] encryptedData = new byte[byteBuffer.remaining()];
            byteBuffer.get(encryptedData);
            
            SecretKeySpec secretKey = new SecretKeySpec(encryptionKey.getBytes(), "AES");
            
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            GCMParameterSpec parameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH * 8, iv);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, parameterSpec);
            
            byte[] decryptedData = cipher.doFinal(encryptedData);
            
            return new String(decryptedData, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new DecryptionException("Error decrypting data", e);
        }
    }
}

@Converter
public class EncryptedStringConverter implements AttributeConverter<String, String> {
    
    @Autowired
    private EncryptionService encryptionService;
    
    @Override
    public String convertToDatabaseColumn(String attribute) {
        if (attribute == null) {
            return null;
        }
        return encryptionService.encrypt(attribute);
    }
    
    @Override
    public String convertToEntityAttribute(String dbData) {
        if (dbData == null) {
            return null;
        }
        return encryptionService.decrypt(dbData);
    }
}
```

### 4.4 Error Handling Implementation

```java
@ControllerAdvice
public class GlobalExceptionHandler {
    
    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(ValidationException ex) {
        logger.warn("Validation error: {}", ex.getMessage());
        
        ErrorResponse error = new ErrorResponse(
            "VALIDATION_ERROR",
            ex.getMessage(),
            System.currentTimeMillis()
        );
        
        return ResponseEntity.badRequest().body(error);
    }
    
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleResourceNotFoundException(ResourceNotFoundException ex) {
        logger.warn("Resource not found: {}", ex.getMessage());
        
        ErrorResponse error = new ErrorResponse(
            "RESOURCE_NOT_FOUND",
            ex.getMessage(),
            System.currentTimeMillis()
        );
        
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }
    
    @ExceptionHandler(InsufficientInventoryException.class)
    public ResponseEntity<ErrorResponse> handleInsufficientInventoryException(InsufficientInventoryException ex) {
        logger.warn("Insufficient inventory: {}", ex.getMessage());
        
        ErrorResponse error = new ErrorResponse(
            "INSUFFICIENT_INVENTORY",
            ex.getMessage(),
            System.currentTimeMillis()
        );
        
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }
    
    @ExceptionHandler(PaymentProcessingException.class)
    public ResponseEntity<ErrorResponse> handlePaymentProcessingException(PaymentProcessingException ex) {
        logger.error("Payment processing error: {}", ex.getMessage(), ex);
        
        ErrorResponse error = new ErrorResponse(
            "PAYMENT_PROCESSING_ERROR",
            "Payment processing failed. Please try again.",
            System.currentTimeMillis()
        );
        
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(error);
    }
    
    @ExceptionHandler(RateLimitExceededException.class)
    public ResponseEntity<ErrorResponse> handleRateLimitExceededException(RateLimitExceededException ex) {
        logger.warn("Rate limit exceeded: {}", ex.getMessage());
        
        ErrorResponse error = new ErrorResponse(
            "RATE_LIMIT_EXCEEDED",
            "Too many requests. Please try again later.",
            System.currentTimeMillis()
        );
        
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(error);
    }
    
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(Exception ex) {
        logger.error("Unexpected error: {}", ex.getMessage(), ex);
        
        ErrorResponse error = new ErrorResponse(
            "INTERNAL_SERVER_ERROR",
            "An unexpected error occurred. Please try again later.",
            System.currentTimeMillis()
        );
        
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }
}

@Component
public class CircuitBreakerService {
    
    private final Map<String, CircuitBreaker> circuitBreakers = new ConcurrentHashMap<>();
    
    @Value("${circuit-breaker.failure-threshold:5}")
    private int failureThreshold;
    
    @Value("${circuit-breaker.timeout:60000}")
    private long timeout;
    
    public <T> T executeWithCircuitBreaker(String serviceName, Supplier<T> operation, Supplier<T> fallback) {
        CircuitBreaker circuitBreaker = getOrCreateCircuitBreaker(serviceName);
        
        if (circuitBreaker.getState() == CircuitBreaker.State.OPEN) {
            logger.warn("Circuit breaker is OPEN for service: {}", serviceName);
            return fallback.get();
        }
        
        try {
            T result = operation.get();
            circuitBreaker.recordSuccess();
            return result;
        } catch (Exception e) {
            circuitBreaker.recordFailure();
            logger.error("Operation failed for service: {}", serviceName, e);
            
            if (circuitBreaker.getState() == CircuitBreaker.State.OPEN) {
                return fallback.get();
            }
            
            throw e;
        }
    }
    
    private CircuitBreaker getOrCreateCircuitBreaker(String serviceName) {
        return circuitBreakers.computeIfAbsent(serviceName, 
            name -> new CircuitBreaker(name, failureThreshold, timeout));
    }
}
```

### 4.5 Monitoring and Logging

```java
@Component
public class AuditLogger {
    
    private static final Logger auditLog = LoggerFactory.getLogger("AUDIT");
    
    public void logUserAction(UUID userId, String action, String resource, Map<String, Object> details) {
        AuditEvent event = AuditEvent.builder()
            .userId(userId)
            .action(action)
            .resource(resource)
            .timestamp(LocalDateTime.now())
            .details(details)
            .ipAddress(getCurrentUserIpAddress())
            .userAgent(getCurrentUserAgent())
            .build();
        
        auditLog.info("AUDIT: {}", objectMapper.writeValueAsString(event));
    }
    
    public void logSecurityEvent(String eventType, String description, Map<String, Object> context) {
        SecurityEvent event = SecurityEvent.builder()
            .eventType(eventType)
            .description(description)
            .timestamp(LocalDateTime.now())
            .context(context)
            .severity(determineSeverity(eventType))
            .build();
        
        auditLog.warn("SECURITY: {}", objectMapper.writeValueAsString(event));
    }
}

@Configuration
@EnableScheduling
public class MonitoringConfig {
    
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

@Component
public class HealthCheckService {
    
    @Autowired
    private DataSource dataSource;
    
    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    
    @Scheduled(fixedRate = 30000) // Every 30 seconds
    public void performHealthChecks() {
        checkDatabaseHealth();
        checkRedisHealth();
        checkExternalServicesHealth();
    }
    
    private void checkDatabaseHealth() {
        try {
            try (Connection connection = dataSource.getConnection()) {
                connection.isValid(5);
            }
            recordHealthMetric("database", true);
        } catch (Exception e) {
            logger.error("Database health check failed", e);
            recordHealthMetric("database", false);
        }
    }
    
    private void checkRedisHealth() {
        try {
            redisTemplate.opsForValue().set("health_check", "ok", Duration.ofSeconds(10));
            recordHealthMetric("redis", true);
        } catch (Exception e) {
            logger.error("Redis health check failed", e);
            recordHealthMetric("redis", false);
        }
    }
    
    private void recordHealthMetric(String service, boolean healthy) {
        Metrics.gauge("service.health", 
            Tags.of("service", service), 
            healthy ? 1.0 : 0.0);
    }
}
```

## 5. Testing Strategy

### 5.1 Unit Tests

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
    void registerUser_ValidRequest_ReturnsUserRegistrationResponse() {
        // Given
        UserRegistrationRequest request = new UserRegistrationRequest(
            "test@example.com", "Password123!", "John", "Doe");
        
        User savedUser = new User();
        savedUser.setUserId(UUID.randomUUID());
        savedUser.setEmail(request.getEmail());
        
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(false);
        when(passwordEncoder.encode(request.getPassword())).thenReturn("hashedPassword");
        when(userRepository.save(any(User.class))).thenReturn(savedUser);
        when(tokenProvider.generateToken(savedUser)).thenReturn("jwt-token");
        
        // When
        UserRegistrationResponse response = userService.registerUser(request);
        
        // Then
        assertThat(response.getUserId()).isEqualTo(savedUser.getUserId());
        assertThat(response.getToken()).isEqualTo("jwt-token");
        
        verify(userRepository).existsByEmail(request.getEmail());
        verify(passwordEncoder).encode(request.getPassword());
        verify(userRepository).save(any(User.class));
        verify(tokenProvider).generateToken(savedUser);
    }
    
    @Test
    void registerUser_UserAlreadyExists_ThrowsUserAlreadyExistsException() {
        // Given
        UserRegistrationRequest request = new UserRegistrationRequest(
            "existing@example.com", "Password123!", "John", "Doe");
        
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(true);
        
        // When & Then
        assertThatThrownBy(() -> userService.registerUser(request))
            .isInstanceOf(UserAlreadyExistsException.class)
            .hasMessage("User with email already exists");
        
        verify(userRepository).existsByEmail(request.getEmail());
        verify(userRepository, never()).save(any(User.class));
    }
}
```

### 5.2 Integration Tests

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:testdb",
    "spring.jpa.hibernate.ddl-auto=create-drop"
})
class OrderServiceIntegrationTest {
    
    @Autowired
    private TestRestTemplate restTemplate;
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private ProductRepository productRepository;
    
    @Autowired
    private OrderRepository orderRepository;
    
    @Test
    void createOrder_ValidRequest_ReturnsCreatedOrder() {
        // Given
        User user = createTestUser();
        Product product = createTestProduct();
        String token = generateJwtToken(user);
        
        CreateOrderRequest request = new CreateOrderRequest();
        request.setItems(List.of(new OrderItemRequest(product.getProductId(), 2)));
        request.setShippingAddress(createTestAddress());
        
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        HttpEntity<CreateOrderRequest> entity = new HttpEntity<>(request, headers);
        
        // When
        ResponseEntity<OrderResponse> response = restTemplate.exchange(
            "/api/v1/orders",
            HttpMethod.POST,
            entity,
            OrderResponse.class
        );
        
        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getUserId()).isEqualTo(user.getUserId());
        assertThat(response.getBody().getStatus()).isEqualTo(OrderStatus.PENDING);
        
        // Verify order was saved to database
        Optional<Order> savedOrder = orderRepository.findById(response.getBody().getOrderId());
        assertThat(savedOrder).isPresent();
        assertThat(savedOrder.get().getOrderItems()).hasSize(1);
    }
    
    private User createTestUser() {
        User user = new User();
        user.setEmail("test@example.com");
        user.setPasswordHash("hashedPassword");
        user.setRole(UserRole.CONSUMER);
        user.setCreatedAt(LocalDateTime.now());
        user.setIsActive(true);
        return userRepository.save(user);
    }
    
    private Product createTestProduct() {
        Product product = new Product();
        product.setName("Test Product");
        product.setDescription("Test Description");
        product.setPrice(BigDecimal.valueOf(99.99));
        product.setSellerId(UUID.randomUUID());
        product.setCategory("Electronics");
        product.setInventory(10);
        product.setIsActive(true);
        product.setCreatedAt(LocalDateTime.now());
        product.setUpdatedAt(LocalDateTime.now());
        return productRepository.save(product);
    }
}
```

### 5.3 Performance Tests

```java
@SpringBootTest
class PerformanceTest {
    
    @Autowired
    private ProductService productService;
    
    @Test
    @Timeout(value = 2, unit = TimeUnit.SECONDS)
    void searchProducts_LargeDataset_CompletesWithinTimeLimit() {
        // Given
        ProductSearchRequest request = new ProductSearchRequest();
        request.setKeyword("laptop");
        request.setPage(0);
        request.setSize(50);
        
        // When
        StopWatch stopWatch = new StopWatch();
        stopWatch.start();
        
        Page<ProductResponse> results = productService.searchProducts(request);
        
        stopWatch.stop();
        
        // Then
        assertThat(results).isNotNull();
        assertThat(stopWatch.getTotalTimeMillis()).isLessThan(2000);
        
        System.out.println("Search completed in: " + stopWatch.getTotalTimeMillis() + "ms");
    }
    
    @Test
    void createOrder_ConcurrentRequests_HandlesLoadCorrectly() throws InterruptedException {
        // Given
        int numberOfThreads = 10;
        int requestsPerThread = 5;
        ExecutorService executor = Executors.newFixedThreadPool(numberOfThreads);
        CountDownLatch latch = new CountDownLatch(numberOfThreads * requestsPerThread);
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger errorCount = new AtomicInteger(0);
        
        // When
        for (int i = 0; i < numberOfThreads; i++) {
            executor.submit(() -> {
                for (int j = 0; j < requestsPerThread; j++) {
                    try {
                        CreateOrderRequest request = createValidOrderRequest();
                        orderService.createOrder(request);
                        successCount.incrementAndGet();
                    } catch (Exception e) {
                        errorCount.incrementAndGet();
                    } finally {
                        latch.countDown();
                    }
                }
            });
        }
        
        latch.await(30, TimeUnit.SECONDS);
        executor.shutdown();
        
        // Then
        assertThat(successCount.get()).isGreaterThan(0);
        assertThat(errorCount.get()).isLessThan(successCount.get());
        
        System.out.println("Successful requests: " + successCount.get());
        System.out.println("Failed requests: " + errorCount.get());
    }
}
```

## 6. Deployment Configuration

### 6.1 Docker Configuration

```dockerfile
# Dockerfile
FROM openjdk:17-jdk-slim

ARG JAR_FILE=target/*.jar
COPY ${JAR_FILE} app.jar

# Create non-root user
RUN addgroup --system spring && adduser --system spring --ingroup spring
USER spring:spring

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app.jar"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - DATABASE_URL=jdbc:postgresql://db:5432/shopping_platform
      - DATABASE_USERNAME=postgres
      - DATABASE_PASSWORD=password
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - db
      - redis
      - elasticsearch
    networks:
      - shopping-network

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=shopping_platform
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - shopping-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    networks:
      - shopping-network

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.8.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
    networks:
      - shopping-network

volumes:
  postgres_data:

networks:
  shopping-network:
    driver: bridge
```

### 6.2 Kubernetes Configuration

```yaml
# k8s-deployment.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shopping-platform-api
  labels:
    app: shopping-platform-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: shopping-platform-api
  template:
    metadata:
      labels:
        app: shopping-platform-api
    spec:
      containers:
      - name: api
        image: shopping-platform:latest
        ports:
        - containerPort: 8080
        env:
        - name: SPRING_PROFILES_ACTIVE
          value: "kubernetes"
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
  name: shopping-platform-service
spec:
  selector:
    app: shopping-platform-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
  type: LoadBalancer

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: shopping-platform-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: shopping-platform-api
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

## 7. Conclusion

This Low-Level Design document provides comprehensive implementation details for the Online Shopping Platform, including:

- **Detailed component specifications** with complete class definitions and database schemas
- **Data flow diagrams** showing request/response patterns and system interactions
- **Sequence diagrams** illustrating complex workflows like order processing and payment handling
- **Security implementation** with JWT authentication, data encryption, and audit logging
- **Error handling strategies** including circuit breakers and graceful degradation
- **Comprehensive testing approach** covering unit, integration, and performance testing
- **Production-ready deployment configurations** for Docker and Kubernetes environments

The design ensures:
- **Scalability**: Microservices architecture with horizontal scaling capabilities
- **Security**: Multi-layered security with encryption, authentication, and audit trails
- **Reliability**: Circuit breakers, retry logic, and comprehensive error handling
- **Performance**: Optimized database queries, caching strategies, and async processing
- **Maintainability**: Clean code architecture with comprehensive testing and monitoring

This implementation provides a solid foundation for building a production-grade e-commerce platform that can handle high traffic loads while maintaining security and compliance requirements.