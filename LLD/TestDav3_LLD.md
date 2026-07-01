# Low-Level Design Document for TestDav3 Online Shopping Platform

## Table of Contents
1. [Component Specifications](#component-specifications)
2. [Data Flow Diagrams](#data-flow-diagrams)
3. [Sequence Diagrams](#sequence-diagrams)
4. [Database Design](#database-design)
5. [API Specifications](#api-specifications)
6. [Implementation Details](#implementation-details)
7. [Security Implementation](#security-implementation)
8. [Performance Optimization](#performance-optimization)

## Component Specifications

### 1. User Management Service

#### Service Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    User Management Service                   │
├─────────────────────────────────────────────────────────────┤
│  Controllers:                                               │
│  ├── AuthController                                         │
│  ├── UserController                                         │
│  ├── ProfileController                                      │
│  └── RoleController                                         │
│                                                             │
│  Services:                                                  │
│  ├── AuthenticationService                                  │
│  ├── AuthorizationService                                   │
│  ├── UserService                                            │
│  ├── PasswordService                                        │
│  └── SessionService                                         │
│                                                             │
│  Repositories:                                              │
│  ├── UserRepository                                         │
│  ├── RoleRepository                                         │
│  └── SessionRepository                                      │
│                                                             │
│  External Integrations:                                     │
│  ├── Redis (Session Storage)                               │
│  ├── PostgreSQL (User Data)                                │
│  └── Vault (Secrets Management)                            │
└─────────────────────────────────────────────────────────────┘
```

#### Class Definitions

**User Entity**
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
    
    @Column
    private String phone;
    
    @Enumerated(EnumType.STRING)
    private UserRole role;
    
    @Column(nullable = false)
    private Boolean isActive = true;
    
    @CreationTimestamp
    private LocalDateTime createdAt;
    
    private LocalDateTime lastLogin;
    
    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL)
    private List<Order> orders;
    
    @OneToOne(mappedBy = "user", cascade = CascadeType.ALL)
    private ShoppingCart shoppingCart;
    
    // Constructors, getters, setters
}

public enum UserRole {
    CONSUMER, SELLER, ADMIN
}
```

**Authentication Service Implementation**
```java
@Service
@Transactional
public class AuthenticationService {
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private PasswordEncoder passwordEncoder;
    
    @Autowired
    private JwtTokenProvider jwtTokenProvider;
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    public AuthResponse authenticate(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new AuthenticationException("Invalid credentials"));
        
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new AuthenticationException("Invalid credentials");
        }
        
        if (!user.getIsActive()) {
            throw new AuthenticationException("Account is deactivated");
        }
        
        String accessToken = jwtTokenProvider.generateAccessToken(user);
        String refreshToken = jwtTokenProvider.generateRefreshToken(user);
        
        // Store session in Redis
        SessionData session = new SessionData(user.getUserId(), accessToken, refreshToken);
        redisTemplate.opsForValue().set(
            "session:" + user.getUserId(), 
            session, 
            Duration.ofMinutes(15)
        );
        
        user.setLastLogin(LocalDateTime.now());
        userRepository.save(user);
        
        return new AuthResponse(accessToken, refreshToken, user.getRole());
    }
    
    public void logout(UUID userId) {
        redisTemplate.delete("session:" + userId);
    }
}
```

### 2. Product Catalog Service

#### Service Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                  Product Catalog Service                    │
├─────────────────────────────────────────────────────────────┤
│  Controllers:                                               │
│  ├── ProductController                                      │
│  ├── CategoryController                                     │
│  ├── SearchController                                       │
│  └── ReviewController                                       │
│                                                             │
│  Services:                                                  │
│  ├── ProductService                                         │
│  ├── CategoryService                                        │
│  ├── SearchService                                          │
│  ├── InventoryService                                       │
│  └── ReviewService                                          │
│                                                             │
│  Repositories:                                              │
│  ├── ProductRepository                                      │
│  ├── CategoryRepository                                     │
│  └── ReviewRepository                                       │
│                                                             │
│  External Integrations:                                     │
│  ├── Elasticsearch (Search)                                │
│  ├── PostgreSQL (Product Data)                             │
│  ├── AWS S3 (Image Storage)                                │
│  └── CloudFront (CDN)                                      │
└─────────────────────────────────────────────────────────────┘
```

**Product Entity**
```java
@Entity
@Table(name = "products")
public class Product {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID productId;
    
    @Column(nullable = false)
    private String name;
    
    @Column(columnDefinition = "TEXT")
    private String description;
    
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;
    
    @Column(nullable = false)
    private UUID sellerId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;
    
    @Column(nullable = false)
    private Integer inventory;
    
    @ElementCollection
    @CollectionTable(name = "product_images")
    private List<String> images;
    
    @Column(nullable = false)
    private Boolean isActive = true;
    
    @CreationTimestamp
    private LocalDateTime createdAt;
    
    @UpdateTimestamp
    private LocalDateTime updatedAt;
    
    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL)
    private List<Review> reviews;
    
    // Constructors, getters, setters
}
```

**Search Service Implementation**
```java
@Service
public class SearchService {
    
    @Autowired
    private ElasticsearchRestTemplate elasticsearchTemplate;
    
    public SearchResponse<Product> searchProducts(ProductSearchRequest request) {
        BoolQueryBuilder queryBuilder = QueryBuilders.boolQuery();
        
        // Text search
        if (StringUtils.hasText(request.getQuery())) {
            queryBuilder.must(QueryBuilders.multiMatchQuery(
                request.getQuery(),
                "name^2", "description"
            ).type(MultiMatchQueryBuilder.Type.BEST_FIELDS));
        }
        
        // Category filter
        if (request.getCategoryId() != null) {
            queryBuilder.filter(QueryBuilders.termQuery(
                "category.categoryId", 
                request.getCategoryId()
            ));
        }
        
        // Price range filter
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
        
        // Active products only
        queryBuilder.filter(QueryBuilders.termQuery("isActive", true));
        
        // Build search query
        NativeSearchQueryBuilder searchQueryBuilder = new NativeSearchQueryBuilder()
            .withQuery(queryBuilder)
            .withPageable(PageRequest.of(
                request.getPage(), 
                request.getSize(),
                Sort.by(request.getSortBy()).descending()
            ));
        
        // Execute search
        SearchHits<Product> searchHits = elasticsearchTemplate.search(
            searchQueryBuilder.build(), 
            Product.class
        );
        
        return new SearchResponse<>(
            searchHits.getSearchHits().stream()
                .map(SearchHit::getContent)
                .collect(Collectors.toList()),
            searchHits.getTotalHits(),
            request.getPage(),
            request.getSize()
        );
    }
}
```

### 3. Order Management Service

#### Service Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                  Order Management Service                   │
├─────────────────────────────────────────────────────────────┤
│  Controllers:                                               │
│  ├── CartController                                         │
│  ├── OrderController                                        │
│  └── CheckoutController                                     │
│                                                             │
│  Services:                                                  │
│  ├── CartService                                            │
│  ├── OrderService                                           │
│  ├── CheckoutService                                        │
│  └── OrderTrackingService                                   │
│                                                             │
│  Repositories:                                              │
│  ├── CartRepository                                         │
│  ├── OrderRepository                                        │
│  └── OrderItemRepository                                    │
│                                                             │
│  External Integrations:                                     │
│  ├── Redis (Cart Cache)                                    │
│  ├── PostgreSQL (Order Data)                               │
│  ├── Kafka (Event Publishing)                              │
│  └── Payment Service                                        │
└─────────────────────────────────────────────────────────────┘
```

**Order Entity**
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
    private OrderStatus status;
    
    @CreationTimestamp
    private LocalDateTime createdAt;
    
    @UpdateTimestamp
    private LocalDateTime updatedAt;
    
    @Column
    private UUID paymentId;
    
    @Embedded
    private Address shippingAddress;
    
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL)
    private List<OrderItem> orderItems;
    
    @OneToOne(mappedBy = "order", cascade = CascadeType.ALL)
    private Payment payment;
    
    // Constructors, getters, setters
}

public enum OrderStatus {
    PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED, REFUNDED
}
```

**Checkout Service Implementation**
```java
@Service
@Transactional
public class CheckoutService {
    
    @Autowired
    private CartService cartService;
    
    @Autowired
    private OrderRepository orderRepository;
    
    @Autowired
    private PaymentServiceClient paymentServiceClient;
    
    @Autowired
    private InventoryServiceClient inventoryServiceClient;
    
    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;
    
    public CheckoutResponse processCheckout(CheckoutRequest request) {
        // 1. Validate cart
        ShoppingCart cart = cartService.getCart(request.getUserId());
        if (cart.getCartItems().isEmpty()) {
            throw new CheckoutException("Cart is empty");
        }
        
        // 2. Reserve inventory
        List<InventoryReservation> reservations = reserveInventory(cart.getCartItems());
        
        try {
            // 3. Create order
            Order order = createOrder(cart, request.getShippingAddress());
            
            // 4. Process payment
            PaymentRequest paymentRequest = new PaymentRequest(
                order.getOrderId(),
                order.getTotalAmount(),
                request.getPaymentMethod()
            );
            
            PaymentResponse paymentResponse = paymentServiceClient.processPayment(paymentRequest);
            
            if (paymentResponse.getStatus() == PaymentStatus.SUCCESS) {
                order.setStatus(OrderStatus.CONFIRMED);
                order.setPaymentId(paymentResponse.getPaymentId());
                orderRepository.save(order);
                
                // 5. Clear cart
                cartService.clearCart(request.getUserId());
                
                // 6. Publish order confirmed event
                OrderConfirmedEvent event = new OrderConfirmedEvent(
                    order.getOrderId(),
                    order.getUserId(),
                    order.getTotalAmount()
                );
                kafkaTemplate.send("order-confirmed", event);
                
                return new CheckoutResponse(order.getOrderId(), paymentResponse.getPaymentId());
            } else {
                // Release inventory reservations
                releaseInventoryReservations(reservations);
                throw new CheckoutException("Payment failed: " + paymentResponse.getErrorMessage());
            }
            
        } catch (Exception e) {
            // Release inventory reservations on any error
            releaseInventoryReservations(reservations);
            throw e;
        }
    }
    
    private List<InventoryReservation> reserveInventory(List<CartItem> cartItems) {
        List<InventoryReservation> reservations = new ArrayList<>();
        
        for (CartItem item : cartItems) {
            InventoryReservationRequest request = new InventoryReservationRequest(
                item.getProductId(),
                item.getQuantity()
            );
            
            InventoryReservation reservation = inventoryServiceClient.reserveInventory(request);
            if (!reservation.isSuccess()) {
                // Release any previous reservations
                releaseInventoryReservations(reservations);
                throw new CheckoutException(
                    "Insufficient inventory for product: " + item.getProductId()
                );
            }
            reservations.add(reservation);
        }
        
        return reservations;
    }
}
```

## Data Flow Diagrams

### 1. User Authentication Flow
```
┌─────────┐    ┌─────────────┐    ┌──────────┐    ┌─────────┐
│ Client  │    │ API Gateway │    │User Mgmt │    │ Redis   │
│         │    │             │    │ Service  │    │         │
└────┬────┘    └──────┬──────┘    └─────┬────┘    └────┬────┘
     │                │                 │              │
     │ POST /auth/login               │              │
     ├────────────────►│                 │              │
     │                │ Validate Request │              │
     │                ├─────────────────►│              │
     │                │                 │ Verify Creds │
     │                │                 ├──────────────┤
     │                │                 │              │
     │                │                 │ Store Session│
     │                │                 ├─────────────►│
     │                │                 │              │
     │                │ JWT + Refresh   │              │
     │                │◄────────────────┤              │
     │ 200 OK + Tokens│                 │              │
     │◄───────────────┤                 │              │
```

### 2. Product Search Flow
```
┌─────────┐    ┌─────────────┐    ┌──────────┐    ┌──────────────┐
│ Client  │    │ API Gateway │    │ Product  │    │Elasticsearch │
│         │    │             │    │ Service  │    │              │
└────┬────┘    └──────┬──────┘    └─────┬────┘    └──────┬───────┘
     │                │                 │                │
     │ GET /products/search?q=laptop    │                │
     ├────────────────►│                 │                │
     │                │ Forward Request │                │
     │                ├─────────────────►│                │
     │                │                 │ Build ES Query │
     │                │                 ├────────────────┤
     │                │                 │                │
     │                │                 │ Execute Search │
     │                │                 ├───────────────►│
     │                │                 │                │
     │                │                 │ Search Results │
     │                │                 │◄───────────────┤
     │                │                 │ Format Response│
     │                │                 ├────────────────┤
     │                │ Product Results │                │
     │                │◄────────────────┤                │
     │ 200 OK + Products              │                │
     │◄───────────────┤                 │                │
```

### 3. Checkout Process Flow
```
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│ Client  │  │Order Mgmt│  │Payment  │  │Inventory│  │ Kafka   │
│         │  │ Service │  │ Service │  │ Service │  │         │
└────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
     │            │            │            │            │
     │POST /checkout          │            │            │
     ├────────────►│            │            │            │
     │            │Reserve Inventory       │            │
     │            ├────────────────────────►│            │
     │            │            │            │            │
     │            │Reservation OK          │            │
     │            │◄───────────────────────┤            │
     │            │            │            │            │
     │            │Process Payment         │            │
     │            ├───────────►│            │            │
     │            │            │            │            │
     │            │Payment OK  │            │            │
     │            │◄───────────┤            │            │
     │            │            │            │            │
     │            │Confirm Inventory       │            │
     │            ├────────────────────────►│            │
     │            │            │            │            │
     │            │Publish Order Event     │            │
     │            ├────────────────────────────────────►│
     │            │            │            │            │
     │Order Created           │            │            │
     │◄───────────┤            │            │            │
```

## Sequence Diagrams

### 1. User Registration Sequence
```
actor User
participant Client
participant APIGateway
participant UserService
participant Database
participant EmailService

User -> Client: Fill registration form
Client -> APIGateway: POST /auth/register
APIGateway -> UserService: Validate and create user
UserService -> UserService: Hash password
UserService -> Database: Save user (inactive)
Database --> UserService: User saved
UserService -> EmailService: Send verification email
EmailService --> UserService: Email sent
UserService --> APIGateway: Registration successful
APIGateway --> Client: 201 Created
Client --> User: Registration confirmation

User -> Client: Click verification link
Client -> APIGateway: GET /auth/verify/{token}
APIGateway -> UserService: Verify token
UserService -> Database: Activate user
Database --> UserService: User activated
UserService --> APIGateway: Verification successful
APIGateway --> Client: 200 OK
Client --> User: Account activated
```

### 2. Add to Cart Sequence
```
actor User
participant Client
participant APIGateway
participant OrderService
participant ProductService
participant Redis
participant Database

User -> Client: Click "Add to Cart"
Client -> APIGateway: POST /cart/items
APIGateway -> OrderService: Add item to cart
OrderService -> ProductService: Validate product
ProductService --> OrderService: Product valid
OrderService -> Redis: Get existing cart
Redis --> OrderService: Cart data
OrderService -> OrderService: Update cart items
OrderService -> Redis: Save updated cart
Redis --> OrderService: Cart saved
OrderService -> Database: Persist cart (async)
OrderService --> APIGateway: Item added
APIGateway --> Client: 200 OK
Client --> User: Item added to cart
```

## Database Design

### Entity Relationship Diagram
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│      users      │    │    products     │    │     orders      │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ user_id (PK)    │    │ product_id (PK) │    │ order_id (PK)   │
│ email (UNIQUE)  │    │ name            │    │ user_id (FK)    │
│ password_hash   │    │ description     │    │ total_amount    │
│ first_name      │    │ price           │    │ status          │
│ last_name       │    │ seller_id (FK)  │    │ created_at      │
│ phone           │    │ category_id (FK)│    │ updated_at      │
│ role            │    │ inventory       │    │ payment_id (FK) │
│ is_active       │    │ is_active       │    │ shipping_addr   │
│ created_at      │    │ created_at      │    └─────────────────┘
│ last_login      │    │ updated_at      │            │
└─────────────────┘    └─────────────────┘            │
         │                       │                     │
         │              ┌─────────────────┐            │
         │              │   categories    │            │
         │              ├─────────────────┤            │
         │              │ category_id (PK)│            │
         │              │ name            │            │
         │              │ description     │            │
         │              │ parent_id (FK)  │            │
         │              │ is_active       │            │
         │              └─────────────────┘            │
         │                                             │
         │              ┌─────────────────┐            │
         └──────────────│ shopping_carts  │            │
                        ├─────────────────┤            │
                        │ cart_id (PK)    │            │
                        │ user_id (FK)    │            │
                        │ created_at      │            │
                        │ updated_at      │            │
                        └─────────────────┘            │
                                 │                     │
                        ┌─────────────────┐            │
                        │   cart_items    │            │
                        ├─────────────────┤            │
                        │ cart_item_id(PK)│            │
                        │ cart_id (FK)    │            │
                        │ product_id (FK) │            │
                        │ quantity        │            │
                        │ price           │            │
                        └─────────────────┘            │
                                                       │
┌─────────────────┐    ┌─────────────────┐            │
│   order_items   │    │    payments     │            │
├─────────────────┤    ├─────────────────┤            │
│ order_item_id(PK)│   │ payment_id (PK) │            │
│ order_id (FK)   │    │ order_id (FK)   │────────────┘
│ product_id (FK) │    │ amount          │
│ quantity        │    │ method          │
│ unit_price      │    │ status          │
│ total_price     │    │ gateway_ref     │
└─────────────────┘    │ processed_at    │
                       │ encrypted_data  │
                       └─────────────────┘
```

### Database Schema Scripts

**Users Table**
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
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
    price DECIMAL(10,2) NOT NULL CHECK (price > 0),
    seller_id UUID NOT NULL,
    category_id UUID,
    inventory INTEGER NOT NULL DEFAULT 0 CHECK (inventory >= 0),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (seller_id) REFERENCES users(user_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_name ON products USING gin(to_tsvector('english', name));
```

**Orders Table**
```sql
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount > 0),
    status VARCHAR(20) NOT NULL CHECK (status IN (
        'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'
    )),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_id UUID,
    shipping_address JSONB NOT NULL,
    
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (payment_id) REFERENCES payments(payment_id)
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);
```

## API Specifications

### Authentication APIs

**POST /auth/register**
```yaml
operationId: registerUser
summary: Register a new user
requestBody:
  required: true
  content:
    application/json:
      schema:
        type: object
        required: [email, password, firstName, lastName, role]
        properties:
          email:
            type: string
            format: email
          password:
            type: string
            minLength: 8
            pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]'
          firstName:
            type: string
            maxLength: 100
          lastName:
            type: string
            maxLength: 100
          phone:
            type: string
            pattern: '^\+?[1-9]\d{1,14}$'
          role:
            type: string
            enum: [CONSUMER, SELLER]
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
            message:
              type: string
  '400':
    description: Invalid input
  '409':
    description: Email already exists
```

**POST /auth/login**
```yaml
operationId: loginUser
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
            expiresIn:
              type: integer
            role:
              type: string
  '401':
    description: Invalid credentials
  '403':
    description: Account deactivated
```

### Product APIs

**GET /products/search**
```yaml
operationId: searchProducts
summary: Search products with filters
parameters:
  - name: q
    in: query
    description: Search query
    schema:
      type: string
  - name: categoryId
    in: query
    description: Filter by category
    schema:
      type: string
      format: uuid
  - name: minPrice
    in: query
    description: Minimum price filter
    schema:
      type: number
      minimum: 0
  - name: maxPrice
    in: query
    description: Maximum price filter
    schema:
      type: number
      minimum: 0
  - name: page
    in: query
    description: Page number (0-based)
    schema:
      type: integer
      minimum: 0
      default: 0
  - name: size
    in: query
    description: Page size
    schema:
      type: integer
      minimum: 1
      maximum: 100
      default: 20
  - name: sortBy
    in: query
    description: Sort field
    schema:
      type: string
      enum: [price, name, createdAt, rating]
      default: createdAt
responses:
  '200':
    description: Search results
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
            pageSize:
              type: integer
```

**POST /products**
```yaml
operationId: createProduct
summary: Create a new product (Seller only)
security:
  - bearerAuth: []
requestBody:
  required: true
  content:
    application/json:
      schema:
        type: object
        required: [name, description, price, categoryId, inventory]
        properties:
          name:
            type: string
            maxLength: 255
          description:
            type: string
          price:
            type: number
            minimum: 0.01
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
    description: Insufficient permissions
```

### Order APIs

**POST /cart/items**
```yaml
operationId: addToCart
summary: Add item to shopping cart
security:
  - bearerAuth: []
requestBody:
  required: true
  content:
    application/json:
      schema:
        type: object
        required: [productId, quantity]
        properties:
          productId:
            type: string
            format: uuid
          quantity:
            type: integer
            minimum: 1
responses:
  '200':
    description: Item added to cart
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/ShoppingCart'
  '400':
    description: Invalid input
  '401':
    description: Unauthorized
  '404':
    description: Product not found
```

**POST /checkout**
```yaml
operationId: processCheckout
summary: Process order checkout
security:
  - bearerAuth: []
requestBody:
  required: true
  content:
    application/json:
      schema:
        type: object
        required: [shippingAddress, paymentMethod]
        properties:
          shippingAddress:
            $ref: '#/components/schemas/Address'
          paymentMethod:
            type: object
            required: [type]
            properties:
              type:
                type: string
                enum: [CREDIT_CARD, DEBIT_CARD, PAYPAL, STRIPE]
              cardToken:
                type: string
              paypalEmail:
                type: string
responses:
  '200':
    description: Checkout successful
    content:
      application/json:
        schema:
          type: object
          properties:
            orderId:
              type: string
              format: uuid
            paymentId:
              type: string
              format: uuid
            totalAmount:
              type: number
  '400':
    description: Invalid input or empty cart
  '401':
    description: Unauthorized
  '402':
    description: Payment failed
  '409':
    description: Insufficient inventory
```

## Implementation Details

### Microservice Configuration

**application.yml (User Service)**
```yaml
spring:
  application:
    name: user-service
  datasource:
    url: jdbc:postgresql://localhost:5432/userdb
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
    driver-class-name: org.postgresql.Driver
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
        format_sql: true
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

jwt:
  secret: ${JWT_SECRET}
  access-token-expiration: 900000  # 15 minutes
  refresh-token-expiration: 604800000  # 7 days

logging:
  level:
    com.shopping.userservice: DEBUG
    org.springframework.security: DEBUG
  pattern:
    console: "%d{yyyy-MM-dd HH:mm:ss} - %msg%n"
    file: "%d{yyyy-MM-dd HH:mm:ss} [%thread] %-5level %logger{36} - %msg%n"

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      show-details: always

server:
  port: 8081
  servlet:
    context-path: /api/v1
```

**Docker Configuration**
```dockerfile
# User Service Dockerfile
FROM openjdk:17-jdk-slim

WORKDIR /app

COPY target/user-service-*.jar app.jar

EXPOSE 8081

ENV JAVA_OPTS="-Xmx512m -Xms256m"

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8081/api/v1/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

**docker-compose.yml**
```yaml
version: '3.8'

services:
  # Databases
  postgres-user:
    image: postgres:15
    environment:
      POSTGRES_DB: userdb
      POSTGRES_USER: userservice
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_user_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U userservice"]
      interval: 30s
      timeout: 10s
      retries: 5

  postgres-product:
    image: postgres:15
    environment:
      POSTGRES_DB: productdb
      POSTGRES_USER: productservice
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_product_data:/var/lib/postgresql/data
    ports:
      - "5433:5432"

  postgres-order:
    image: postgres:15
    environment:
      POSTGRES_DB: orderdb
      POSTGRES_USER: orderservice
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_order_data:/var/lib/postgresql/data
    ports:
      - "5434:5432"

  # Cache
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Search
  elasticsearch:
    image: elasticsearch:8.8.0
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Message Queue
  kafka:
    image: confluentinc/cp-kafka:latest
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    ports:
      - "9092:9092"
    depends_on:
      - zookeeper

  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    ports:
      - "2181:2181"

  # Services
  user-service:
    build:
      context: ./user-service
      dockerfile: Dockerfile
    environment:
      DB_USERNAME: userservice
      DB_PASSWORD: ${DB_PASSWORD}
      REDIS_HOST: redis
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
    ports:
      - "8081:8081"
    depends_on:
      postgres-user:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8081/api/v1/actuator/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5

  product-service:
    build:
      context: ./product-service
      dockerfile: Dockerfile
    environment:
      DB_USERNAME: productservice
      DB_PASSWORD: ${DB_PASSWORD}
      ELASTICSEARCH_URL: http://elasticsearch:9200
    ports:
      - "8082:8082"
    depends_on:
      postgres-product:
        condition: service_healthy
      elasticsearch:
        condition: service_healthy

  order-service:
    build:
      context: ./order-service
      dockerfile: Dockerfile
    environment:
      DB_USERNAME: orderservice
      DB_PASSWORD: ${DB_PASSWORD}
      REDIS_HOST: redis
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      KAFKA_BOOTSTRAP_SERVERS: kafka:9092
    ports:
      - "8083:8083"
    depends_on:
      postgres-order:
        condition: service_healthy
      redis:
        condition: service_healthy
      kafka:
        condition: service_started

  # API Gateway
  api-gateway:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - user-service
      - product-service
      - order-service

volumes:
  postgres_user_data:
  postgres_product_data:
  postgres_order_data:
  redis_data:
  elasticsearch_data:
```

### Kubernetes Deployment

**user-service-deployment.yaml**
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
        image: shopping-platform/user-service:latest
        ports:
        - containerPort: 8081
        env:
        - name: DB_USERNAME
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: username
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: password
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: secret
        - name: REDIS_HOST
          value: "redis-service"
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: password
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /api/v1/actuator/health
            port: 8081
          initialDelaySeconds: 60
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /api/v1/actuator/health
            port: 8081
          initialDelaySeconds: 30
          periodSeconds: 10
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

## Security Implementation

### JWT Token Implementation

**JwtTokenProvider.java**
```java
@Component
public class JwtTokenProvider {
    
    @Value("${jwt.secret}")
    private String jwtSecret;
    
    @Value("${jwt.access-token-expiration}")
    private long accessTokenExpiration;
    
    @Value("${jwt.refresh-token-expiration}")
    private long refreshTokenExpiration;
    
    private Key getSigningKey() {
        byte[] keyBytes = Decoders.BASE64.decode(jwtSecret);
        return Keys.hmacShaKeyFor(keyBytes);
    }
    
    public String generateAccessToken(User user) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + accessTokenExpiration);
        
        return Jwts.builder()
            .setSubject(user.getUserId().toString())
            .claim("email", user.getEmail())
            .claim("role", user.getRole().name())
            .claim("type", "ACCESS")
            .setIssuedAt(now)
            .setExpirationTime(expiryDate)
            .signWith(getSigningKey(), SignatureAlgorithm.HS512)
            .compact();
    }
    
    public String generateRefreshToken(User user) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + refreshTokenExpiration);
        
        return Jwts.builder()
            .setSubject(user.getUserId().toString())
            .claim("type", "REFRESH")
            .setIssuedAt(now)
            .setExpirationTime(expiryDate)
            .signWith(getSigningKey(), SignatureAlgorithm.HS512)
            .compact();
    }
    
    public Claims getClaimsFromToken(String token) {
        return Jwts.parserBuilder()
            .setSigningKey(getSigningKey())
            .build()
            .parseClaimsJws(token)
            .getBody();
    }
    
    public boolean validateToken(String token) {
        try {
            Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
    
    public UUID getUserIdFromToken(String token) {
        Claims claims = getClaimsFromToken(token);
        return UUID.fromString(claims.getSubject());
    }
    
    public UserRole getRoleFromToken(String token) {
        Claims claims = getClaimsFromToken(token);
        return UserRole.valueOf(claims.get("role", String.class));
    }
}
```

### Security Configuration

**SecurityConfig.java**
```java
@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
public class SecurityConfig {
    
    @Autowired
    private JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint;
    
    @Autowired
    private JwtTokenProvider jwtTokenProvider;
    
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
        http.cors(Customizer.withDefaults())
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> 
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(exception -> 
                exception.authenticationEntryPoint(jwtAuthenticationEntryPoint))
            .authorizeHttpRequests(authz -> authz
                .requestMatchers("/api/v1/auth/**").permitAll()
                .requestMatchers("/api/v1/products/search").permitAll()
                .requestMatchers("/api/v1/products/{id}").permitAll()
                .requestMatchers("/actuator/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/products").hasRole("SELLER")
                .requestMatchers(HttpMethod.PUT, "/api/v1/products/**").hasRole("SELLER")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/products/**").hasRole("SELLER")
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthenticationFilter(), 
                UsernamePasswordAuthenticationFilter.class);
        
        // Security headers
        http.headers(headers -> headers
            .frameOptions().deny()
            .contentTypeOptions(Customizer.withDefaults())
            .httpStrictTransportSecurity(hstsConfig -> hstsConfig
                .maxAgeInSeconds(31536000)
                .includeSubdomains(true)
            )
            .and()
            .addHeaderWriter(new StaticHeadersWriter(
                "X-Content-Security-Policy",
                "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
            ))
        );
        
        return http.build();
    }
    
    @Bean
    public JwtAuthenticationFilter jwtAuthenticationFilter() {
        return new JwtAuthenticationFilter(jwtTokenProvider);
    }
    
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(Arrays.asList("*"));
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(Arrays.asList("*"));
        configuration.setAllowCredentials(true);
        
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
```

### Input Validation

**ValidationConfig.java**
```java
@Configuration
public class ValidationConfig {
    
    @Bean
    public Validator validator() {
        return Validation.buildDefaultValidatorFactory().getValidator();
    }
    
    @Bean
    public MethodValidationPostProcessor methodValidationPostProcessor() {
        MethodValidationPostProcessor processor = new MethodValidationPostProcessor();
        processor.setValidator(validator());
        return processor;
    }
}
```

**Custom Validation Annotations**
```java
@Documented
@Constraint(validatedBy = PasswordValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidPassword {
    String message() default "Password must contain at least 8 characters, including uppercase, lowercase, digit and special character";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}

public class PasswordValidator implements ConstraintValidator<ValidPassword, String> {
    
    private static final String PASSWORD_PATTERN = 
        "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$";
    
    private static final Pattern pattern = Pattern.compile(PASSWORD_PATTERN);
    
    @Override
    public boolean isValid(String password, ConstraintValidatorContext context) {
        return password != null && pattern.matcher(password).matches();
    }
}
```

### Encryption Implementation

**EncryptionService.java**
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
            SecretKeySpec secretKey = new SecretKeySpec(
                Base64.getDecoder().decode(encryptionKey), 
                "AES"
            );
            
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            byte[] iv = new byte[GCM_IV_LENGTH];
            SecureRandom.getInstanceStrong().nextBytes(iv);
            
            GCMParameterSpec gcmParameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH * 8, iv);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, gcmParameterSpec);
            
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
            SecretKeySpec secretKey = new SecretKeySpec(
                Base64.getDecoder().decode(encryptionKey), 
                "AES"
            );
            
            byte[] encryptedData = Base64.getDecoder().decode(encryptedText);
            ByteBuffer byteBuffer = ByteBuffer.wrap(encryptedData);
            
            byte[] iv = new byte[GCM_IV_LENGTH];
            byteBuffer.get(iv);
            
            byte[] cipherText = new byte[byteBuffer.remaining()];
            byteBuffer.get(cipherText);
            
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            GCMParameterSpec gcmParameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH * 8, iv);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmParameterSpec);
            
            byte[] decryptedData = cipher.doFinal(cipherText);
            
            return new String(decryptedData, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new EncryptionException("Error decrypting data", e);
        }
    }
}
```

## Performance Optimization

### Caching Strategy

**CacheConfig.java**
```java
@Configuration
@EnableCaching
public class CacheConfig {
    
    @Bean
    public CacheManager cacheManager(RedisConnectionFactory redisConnectionFactory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(30))
            .serializeKeysWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()));
        
        Map<String, RedisCacheConfiguration> cacheConfigurations = new HashMap<>();
        
        // User cache - 15 minutes
        cacheConfigurations.put("users", config.entryTtl(Duration.ofMinutes(15)));
        
        // Product cache - 1 hour
        cacheConfigurations.put("products", config.entryTtl(Duration.ofHours(1)));
        
        // Category cache - 24 hours
        cacheConfigurations.put("categories", config.entryTtl(Duration.ofHours(24)));
        
        // Search results cache - 5 minutes
        cacheConfigurations.put("search", config.entryTtl(Duration.ofMinutes(5)));
        
        return RedisCacheManager.builder(redisConnectionFactory)
            .cacheDefaults(config)
            .withInitialCacheConfigurations(cacheConfigurations)
            .build();
    }
}
```

**Cacheable Service Methods**
```java
@Service
public class ProductService {
    
    @Cacheable(value = "products", key = "#productId")
    public Product getProductById(UUID productId) {
        return productRepository.findById(productId)
            .orElseThrow(() -> new ProductNotFoundException("Product not found: " + productId));
    }
    
    @Cacheable(value = "categories", key = "'all'")
    public List<Category> getAllCategories() {
        return categoryRepository.findAllByIsActiveTrue();
    }
    
    @Cacheable(value = "search", key = "#request.hashCode()")
    public SearchResponse<Product> searchProducts(ProductSearchRequest request) {
        return searchService.searchProducts(request);
    }
    
    @CacheEvict(value = "products", key = "#product.productId")
    public Product updateProduct(Product product) {
        return productRepository.save(product);
    }
    
    @CacheEvict(value = {"products", "search"}, allEntries = true)
    public Product createProduct(Product product) {
        return productRepository.save(product);
    }
}
```

### Database Optimization

**Connection Pool Configuration**
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
      pool-name: HikariPool-UserService
  jpa:
    properties:
      hibernate:
        jdbc:
          batch_size: 25
        order_inserts: true
        order_updates: true
        batch_versioned_data: true
        connection:
          provider_disables_autocommit: true
        query:
          in_clause_parameter_padding: true
        cache:
          use_second_level_cache: true
          region:
            factory_class: org.hibernate.cache.jcache.JCacheRegionFactory
```

**Repository Optimization**
```java
@Repository
public interface ProductRepository extends JpaRepository<Product, UUID> {
    
    @Query("SELECT p FROM Product p WHERE p.isActive = true AND p.category.categoryId = :categoryId")
    @QueryHints(@QueryHint(name = org.hibernate.jpa.QueryHints.HINT_CACHEABLE, value = "true"))
    List<Product> findActiveProductsByCategory(@Param("categoryId") UUID categoryId);
    
    @Query(value = "SELECT * FROM products p WHERE p.is_active = true " +
           "AND (:categoryId IS NULL OR p.category_id = :categoryId) " +
           "AND (:minPrice IS NULL OR p.price >= :minPrice) " +
           "AND (:maxPrice IS NULL OR p.price <= :maxPrice) " +
           "ORDER BY p.created_at DESC",
           countQuery = "SELECT count(*) FROM products p WHERE p.is_active = true " +
                       "AND (:categoryId IS NULL OR p.category_id = :categoryId) " +
                       "AND (:minPrice IS NULL OR p.price >= :minPrice) " +
                       "AND (:maxPrice IS NULL OR p.price <= :maxPrice)",
           nativeQuery = true)
    Page<Product> findProductsWithFilters(
        @Param("categoryId") UUID categoryId,
        @Param("minPrice") BigDecimal minPrice,
        @Param("maxPrice") BigDecimal maxPrice,
        Pageable pageable
    );
    
    @Modifying
    @Query("UPDATE Product p SET p.inventory = p.inventory - :quantity WHERE p.productId = :productId AND p.inventory >= :quantity")
    int decrementInventory(@Param("productId") UUID productId, @Param("quantity") int quantity);
}
```

### Monitoring and Metrics

**MetricsConfig.java**
```java
@Configuration
public class MetricsConfig {
    
    @Bean
    public TimedAspect timedAspect(MeterRegistry registry) {
        return new TimedAspect(registry);
    }
    
    @Bean
    public CountedAspect countedAspect(MeterRegistry registry) {
        return new CountedAspect(registry);
    }
    
    @EventListener
    public void handleAuthenticationSuccess(AuthenticationSuccessEvent event) {
        Metrics.counter("authentication.success", 
            "user", event.getAuthentication().getName()).increment();
    }
    
    @EventListener
    public void handleAuthenticationFailure(AbstractAuthenticationFailureEvent event) {
        Metrics.counter("authentication.failure", 
            "reason", event.getException().getClass().getSimpleName()).increment();
    }
}
```

**Custom Metrics**
```java
@Component
public class BusinessMetrics {
    
    private final Counter orderCreatedCounter;
    private final Timer checkoutTimer;
    private final Gauge activeUsersGauge;
    
    public BusinessMetrics(MeterRegistry meterRegistry, UserService userService) {
        this.orderCreatedCounter = Counter.builder("orders.created")
            .description("Number of orders created")
            .register(meterRegistry);
            
        this.checkoutTimer = Timer.builder("checkout.duration")
            .description("Checkout process duration")
            .register(meterRegistry);
            
        this.activeUsersGauge = Gauge.builder("users.active")
            .description("Number of active users")
            .register(meterRegistry, userService, UserService::getActiveUserCount);
    }
    
    public void recordOrderCreated() {
        orderCreatedCounter.increment();
    }
    
    public Timer.Sample startCheckoutTimer() {
        return Timer.start();
    }
    
    public void recordCheckoutDuration(Timer.Sample sample) {
        sample.stop(checkoutTimer);
    }
}
```

This comprehensive Low-Level Design document provides detailed implementation specifications for the TestDav3 Online Shopping Platform, covering all architectural components, data flows, security implementations, and performance optimizations required for a production-ready e-commerce system.