# Low-Level Design Document for Online Shopping Platform

### 1. Component Specifications

#### 1.1 User Service Component

**Authentication Module**
```java
@Component
public class AuthenticationService {
    
    @Autowired
    private JwtTokenProvider tokenProvider;
    
    @Autowired
    private PasswordEncoder passwordEncoder;
    
    @Autowired
    private UserRepository userRepository;
    
    public AuthenticationResponse authenticate(LoginRequest request) {
        User user = validateCredentials(request.getEmail(), request.getPassword());
        String accessToken = tokenProvider.generateAccessToken(user);
        String refreshToken = tokenProvider.generateRefreshToken(user);
        
        return AuthenticationResponse.builder()
            .accessToken(accessToken)
            .refreshToken(refreshToken)
            .expiresIn(3600)
            .build();
    }
    
    private User validateCredentials(String email, String password) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new InvalidCredentialsException("Invalid email or password"));
            
        if (!passwordEncoder.matches(password, user.getPassword())) {
            throw new InvalidCredentialsException("Invalid email or password");
        }
        
        if (!user.isActive()) {
            throw new AccountDisabledException("Account is disabled");
        }
        
        return user;
    }
}
```

**Profile Management Module**
```java
@Entity
@Table(name = "user_profiles")
public class UserProfile {
    @Id
    private UUID profileId;
    
    @Column(nullable = false)
    private UUID userId;
    
    @Column(length = 15)
    private String phone;
    
    @Column(columnDefinition = "TEXT")
    private String address;
    
    @Column
    private LocalDate dateOfBirth;
    
    @Column(columnDefinition = "JSONB")
    private String preferences;
    
    @CreationTimestamp
    private LocalDateTime createdAt;
    
    @UpdateTimestamp
    private LocalDateTime updatedAt;
}

@Service
public class ProfileService {
    
    @Autowired
    private ProfileRepository profileRepository;
    
    @Transactional
    public ProfileResponse updateProfile(UUID userId, UpdateProfileRequest request) {
        UserProfile profile = profileRepository.findByUserId(userId)
            .orElse(new UserProfile());
            
        profile.setUserId(userId);
        profile.setPhone(request.getPhone());
        profile.setAddress(request.getAddress());
        profile.setDateOfBirth(request.getDateOfBirth());
        profile.setPreferences(JsonUtils.toJson(request.getPreferences()));
        
        UserProfile savedProfile = profileRepository.save(profile);
        return ProfileMapper.toResponse(savedProfile);
    }
}
```

#### 1.2 Product Service Component

**Catalog Management Module**
```java
@Entity
@Table(name = "products")
public class Product {
    @Id
    private UUID productId;
    
    @Column(nullable = false, length = 255)
    private String name;
    
    @Column(columnDefinition = "TEXT")
    private String description;
    
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;
    
    @Column(nullable = false)
    private UUID sellerId;
    
    @Column(nullable = false)
    private UUID categoryId;
    
    @Column(nullable = false)
    private Integer inventory;
    
    @Column(columnDefinition = "TEXT[]")
    private String[] images;
    
    @Column(nullable = false)
    private Boolean isActive = true;
    
    @CreationTimestamp
    private LocalDateTime createdAt;
    
    @UpdateTimestamp
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
    
    @Transactional
    public ProductResponse createProduct(CreateProductRequest request) {
        Product product = Product.builder()
            .productId(UUID.randomUUID())
            .name(request.getName())
            .description(request.getDescription())
            .price(request.getPrice())
            .sellerId(request.getSellerId())
            .categoryId(request.getCategoryId())
            .inventory(request.getInitialInventory())
            .images(request.getImages())
            .isActive(true)
            .build();
            
        Product savedProduct = productRepository.save(product);
        
        // Index in Elasticsearch
        indexProductInSearch(savedProduct);
        
        // Initialize inventory
        inventoryService.initializeInventory(savedProduct.getProductId(), 
                                           request.getInitialInventory());
        
        return ProductMapper.toResponse(savedProduct);
    }
    
    public Page<ProductResponse> searchProducts(ProductSearchRequest request) {
        SearchQuery searchQuery = new NativeSearchQueryBuilder()
            .withQuery(QueryBuilders.multiMatchQuery(request.getQuery())
                .field("name", 2.0f)
                .field("description", 1.0f))
            .withFilter(QueryBuilders.boolQuery()
                .must(QueryBuilders.termQuery("isActive", true))
                .must(QueryBuilders.rangeQuery("price")
                    .gte(request.getMinPrice())
                    .lte(request.getMaxPrice())))
            .withPageable(PageRequest.of(request.getPage(), request.getSize()))
            .build();
            
        SearchHits<Product> searchHits = elasticsearchTemplate.search(searchQuery, Product.class);
        
        return new PageImpl<>(
            searchHits.stream()
                .map(hit -> ProductMapper.toResponse(hit.getContent()))
                .collect(Collectors.toList()),
            request.getPageable(),
            searchHits.getTotalHits()
        );
    }
}
```

#### 1.3 Order Service Component

**Shopping Cart Module**
```java
@Entity
@Table(name = "shopping_cart")
public class ShoppingCart {
    @Id
    private UUID cartId;
    
    @Column(nullable = false)
    private UUID userId;
    
    @Column(nullable = false)
    private UUID productId;
    
    @Column(nullable = false)
    private Integer quantity;
    
    @CreationTimestamp
    private LocalDateTime addedAt;
}

@Service
public class CartService {
    
    @Autowired
    private CartRepository cartRepository;
    
    @Autowired
    private ProductService productService;
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    @Transactional
    public CartResponse addToCart(UUID userId, AddToCartRequest request) {
        // Validate product availability
        ProductResponse product = productService.getProduct(request.getProductId());
        if (product.getInventory() < request.getQuantity()) {
            throw new InsufficientInventoryException("Not enough inventory available");
        }
        
        // Check existing cart item
        Optional<ShoppingCart> existingItem = cartRepository
            .findByUserIdAndProductId(userId, request.getProductId());
            
        ShoppingCart cartItem;
        if (existingItem.isPresent()) {
            cartItem = existingItem.get();
            cartItem.setQuantity(cartItem.getQuantity() + request.getQuantity());
        } else {
            cartItem = ShoppingCart.builder()
                .cartId(UUID.randomUUID())
                .userId(userId)
                .productId(request.getProductId())
                .quantity(request.getQuantity())
                .build();
        }
        
        ShoppingCart savedItem = cartRepository.save(cartItem);
        
        // Update cart cache
        updateCartCache(userId);
        
        return CartMapper.toResponse(savedItem);
    }
    
    public CartSummaryResponse getCartSummary(UUID userId) {
        String cacheKey = "cart:" + userId;
        CartSummaryResponse cached = (CartSummaryResponse) redisTemplate.opsForValue().get(cacheKey);
        
        if (cached != null) {
            return cached;
        }
        
        List<ShoppingCart> cartItems = cartRepository.findByUserId(userId);
        CartSummaryResponse summary = calculateCartSummary(cartItems);
        
        redisTemplate.opsForValue().set(cacheKey, summary, Duration.ofMinutes(30));
        return summary;
    }
}
```

**Checkout Workflow Module**
```java
@Service
public class CheckoutService {
    
    @Autowired
    private CartService cartService;
    
    @Autowired
    private PaymentService paymentService;
    
    @Autowired
    private InventoryService inventoryService;
    
    @Autowired
    private OrderRepository orderRepository;
    
    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;
    
    @Transactional
    public CheckoutResponse processCheckout(UUID userId, CheckoutRequest request) {
        // 1. Validate cart
        CartSummaryResponse cart = cartService.getCartSummary(userId);
        if (cart.getItems().isEmpty()) {
            throw new EmptyCartException("Cart is empty");
        }
        
        // 2. Reserve inventory
        List<InventoryReservation> reservations = reserveInventory(cart.getItems());
        
        try {
            // 3. Create order
            Order order = createOrder(userId, cart, request);
            
            // 4. Process payment
            PaymentResponse payment = paymentService.processPayment(
                PaymentRequest.builder()
                    .orderId(order.getOrderId())
                    .amount(cart.getTotalAmount())
                    .paymentMethod(request.getPaymentMethod())
                    .build()
            );
            
            // 5. Confirm inventory reservations
            inventoryService.confirmReservations(reservations);
            
            // 6. Clear cart
            cartService.clearCart(userId);
            
            // 7. Publish order created event
            publishOrderCreatedEvent(order);
            
            return CheckoutResponse.builder()
                .orderId(order.getOrderId())
                .paymentId(payment.getPaymentId())
                .status("CONFIRMED")
                .build();
                
        } catch (Exception e) {
            // Rollback inventory reservations
            inventoryService.releaseReservations(reservations);
            throw e;
        }
    }
}
```

### 2. Data Flow Diagrams

#### 2.1 User Authentication Flow

```
sequenceDiagram
    participant Client
    participant APIGateway
    participant AuthService
    participant UserDB
    participant Redis
    
    Client->>APIGateway: POST /auth/login
    APIGateway->>AuthService: authenticate(credentials)
    AuthService->>UserDB: findByEmail(email)
    UserDB-->>AuthService: User entity
    AuthService->>AuthService: validatePassword()
    AuthService->>AuthService: generateTokens()
    AuthService->>Redis: storeRefreshToken()
    AuthService-->>APIGateway: AuthResponse
    APIGateway-->>Client: JWT tokens
```

#### 2.2 Product Search Flow

```
sequenceDiagram
    participant Client
    participant APIGateway
    participant ProductService
    participant Elasticsearch
    participant ProductDB
    participant Redis
    
    Client->>APIGateway: GET /products/search?q=laptop
    APIGateway->>ProductService: searchProducts(query)
    ProductService->>Redis: checkCache(query)
    Redis-->>ProductService: cache miss
    ProductService->>Elasticsearch: search(query)
    Elasticsearch-->>ProductService: SearchResults
    ProductService->>ProductDB: getProductDetails(ids)
    ProductDB-->>ProductService: Product entities
    ProductService->>Redis: cacheResults(query, results)
    ProductService-->>APIGateway: ProductSearchResponse
    APIGateway-->>Client: Product list
```

#### 2.3 Order Processing Flow

```
sequenceDiagram
    participant Client
    participant APIGateway
    participant OrderService
    participant PaymentService
    participant InventoryService
    participant Kafka
    participant OrderDB
    
    Client->>APIGateway: POST /orders/checkout
    APIGateway->>OrderService: processCheckout(request)
    OrderService->>InventoryService: reserveInventory(items)
    InventoryService-->>OrderService: reservations
    OrderService->>OrderDB: createOrder(order)
    OrderDB-->>OrderService: Order entity
    OrderService->>PaymentService: processPayment(payment)
    PaymentService-->>OrderService: PaymentResponse
    OrderService->>InventoryService: confirmReservations()
    OrderService->>Kafka: publishOrderCreatedEvent()
    OrderService-->>APIGateway: CheckoutResponse
    APIGateway-->>Client: Order confirmation
```

### 3. Sequence Diagrams

#### 3.1 Complete User Registration Sequence

```
@startuml
actor User
participant "Web Client" as Client
participant "API Gateway" as Gateway
participant "User Service" as UserSvc
participant "Email Service" as EmailSvc
participant "Database" as DB
participant "Redis Cache" as Cache

User -> Client: Fill registration form
Client -> Gateway: POST /auth/register
Gateway -> UserSvc: registerUser(userData)

UserSvc -> UserSvc: validateInput()
UserSvc -> DB: checkEmailExists()
DB --> UserSvc: email available

UserSvc -> UserSvc: hashPassword()
UserSvc -> DB: saveUser(user)
DB --> UserSvc: user created

UserSvc -> UserSvc: generateVerificationToken()
UserSvc -> Cache: storeToken(token, userId)
UserSvc -> EmailSvc: sendVerificationEmail(email, token)
EmailSvc --> UserSvc: email sent

UserSvc --> Gateway: RegistrationResponse
Gateway --> Client: Success response
Client --> User: Registration successful

User -> User: Check email
User -> Client: Click verification link
Client -> Gateway: GET /auth/verify?token=xyz
Gateway -> UserSvc: verifyEmail(token)

UserSvc -> Cache: getToken(token)
Cache --> UserSvc: userId

UserSvc -> DB: activateUser(userId)
DB --> UserSvc: user activated

UserSvc --> Gateway: VerificationResponse
Gateway --> Client: Account verified
Client --> User: Account activated
@enduml
```

#### 3.2 Product Purchase Sequence

```
@startuml
actor Customer
participant "Web Client" as Client
participant "API Gateway" as Gateway
participant "Product Service" as ProductSvc
participant "Cart Service" as CartSvc
participant "Order Service" as OrderSvc
participant "Payment Service" as PaymentSvc
participant "Inventory Service" as InventorySvc
participant "Notification Service" as NotificationSvc

Customer -> Client: Browse products
Client -> Gateway: GET /products/search
Gateway -> ProductSvc: searchProducts()
ProductSvc --> Gateway: Product list
Gateway --> Client: Products displayed

Customer -> Client: Add to cart
Client -> Gateway: POST /cart/add
Gateway -> CartSvc: addToCart(productId, quantity)
CartSvc -> InventorySvc: checkAvailability()
InventorySvc --> CartSvc: available
CartSvc --> Gateway: Item added
Gateway --> Client: Cart updated

Customer -> Client: Proceed to checkout
Client -> Gateway: POST /orders/checkout
Gateway -> OrderSvc: processCheckout()

OrderSvc -> CartSvc: getCartItems()
CartSvc --> OrderSvc: cart items

OrderSvc -> InventorySvc: reserveInventory()
InventorySvc --> OrderSvc: inventory reserved

OrderSvc -> PaymentSvc: processPayment()
PaymentSvc -> PaymentSvc: chargeCard()
PaymentSvc --> OrderSvc: payment successful

OrderSvc -> InventorySvc: confirmReservation()
OrderSvc -> NotificationSvc: sendOrderConfirmation()

OrderSvc --> Gateway: Order created
Gateway --> Client: Order confirmation
Client --> Customer: Purchase complete
@enduml
```

### 4. Implementation Details

#### 4.1 Database Schema Design

**Users Table**
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'CUSTOMER',
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
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
    seller_id UUID NOT NULL REFERENCES users(user_id),
    category_id UUID NOT NULL REFERENCES categories(category_id),
    inventory INTEGER NOT NULL DEFAULT 0,
    images TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_price ON products(price);
```

**Orders Table**
```sql
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    total_amount DECIMAL(10,2) NOT NULL,
    status order_status NOT NULL DEFAULT 'PENDING',
    shipping_address JSONB NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);
```

#### 4.2 API Specifications

**Authentication API**
```yaml
openapi: 3.0.0
info:
  title: Shopping Platform Authentication API
  version: 1.0.0

paths:
  /auth/register:
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
                password:
                  type: string
                  minLength: 8
                firstName:
                  type: string
                  maxLength: 100
                lastName:
                  type: string
                  maxLength: 100
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

  /auth/login:
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
                  accessToken:
                    type: string
                  refreshToken:
                    type: string
                  expiresIn:
                    type: integer
                  tokenType:
                    type: string
                    example: "Bearer"
```

#### 4.3 Security Implementation

**JWT Token Configuration**
```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    
    @Bean
    public JwtTokenProvider jwtTokenProvider() {
        return new JwtTokenProvider(
            secretKey,
            accessTokenValidityInSeconds,
            refreshTokenValidityInSeconds
        );
    }
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf().disable()
            .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            .authorizeHttpRequests(authz -> authz
                .requestMatchers("/auth/**").permitAll()
                .requestMatchers("/products/search").permitAll()
                .requestMatchers(HttpMethod.GET, "/products/**").permitAll()
                .requestMatchers("/admin/**").hasRole("ADMIN")
                .requestMatchers("/seller/**").hasAnyRole("SELLER", "ADMIN")
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthenticationFilter(), UsernamePasswordAuthenticationFilter.class)
            .exceptionHandling()
                .authenticationEntryPoint(jwtAuthenticationEntryPoint())
                .accessDeniedHandler(jwtAccessDeniedHandler())
            .build();
    }
}
```

**Input Validation**
```java
@Component
public class InputValidator {
    
    private static final Pattern EMAIL_PATTERN = 
        Pattern.compile("^[A-Za-z0-9+_.-]+@([A-Za-z0-9.-]+\\.[A-Za-z]{2,})$");
    
    private static final Pattern PASSWORD_PATTERN = 
        Pattern.compile("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$");
    
    public void validateRegistration(RegistrationRequest request) {
        List<String> errors = new ArrayList<>();
        
        if (!EMAIL_PATTERN.matcher(request.getEmail()).matches()) {
            errors.add("Invalid email format");
        }
        
        if (!PASSWORD_PATTERN.matcher(request.getPassword()).matches()) {
            errors.add("Password must contain at least 8 characters, including uppercase, lowercase, digit, and special character");
        }
        
        if (request.getFirstName().length() > 100) {
            errors.add("First name cannot exceed 100 characters");
        }
        
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
    }
}
```

#### 4.4 Error Handling Implementation

**Global Exception Handler**
```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    
    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(ValidationException ex) {
        logger.warn("Validation error: {}", ex.getMessage());
        
        ErrorResponse error = ErrorResponse.builder()
            .code("VALIDATION_ERROR")
            .message("Input validation failed")
            .details(ex.getErrors())
            .timestamp(Instant.now())
            .build();
            
        return ResponseEntity.badRequest().body(error);
    }
    
    @ExceptionHandler(InsufficientInventoryException.class)
    public ResponseEntity<ErrorResponse> handleInsufficientInventory(InsufficientInventoryException ex) {
        logger.warn("Insufficient inventory: {}", ex.getMessage());
        
        ErrorResponse error = ErrorResponse.builder()
            .code("INSUFFICIENT_INVENTORY")
            .message(ex.getMessage())
            .timestamp(Instant.now())
            .build();
            
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }
    
    @ExceptionHandler(PaymentProcessingException.class)
    public ResponseEntity<ErrorResponse> handlePaymentError(PaymentProcessingException ex) {
        logger.error("Payment processing failed: {}", ex.getMessage(), ex);
        
        ErrorResponse error = ErrorResponse.builder()
            .code("PAYMENT_FAILED")
            .message("Payment could not be processed")
            .timestamp(Instant.now())
            .build();
            
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(error);
    }
    
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(Exception ex) {
        logger.error("Unexpected error occurred: {}", ex.getMessage(), ex);
        
        ErrorResponse error = ErrorResponse.builder()
            .code("INTERNAL_ERROR")
            .message("An unexpected error occurred")
            .timestamp(Instant.now())
            .build();
            
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }
}
```

#### 4.5 Performance Optimization

**Caching Strategy**
```java
@Configuration
@EnableCaching
public class CacheConfig {
    
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
            .serializeKeysWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()));
    }
}

@Service
public class ProductService {
    
    @Cacheable(value = "products", key = "#productId")
    public ProductResponse getProduct(UUID productId) {
        return productRepository.findById(productId)
            .map(ProductMapper::toResponse)
            .orElseThrow(() -> new ProductNotFoundException("Product not found"));
    }
    
    @Cacheable(value = "product-search", key = "#request.hashCode()")
    public Page<ProductResponse> searchProducts(ProductSearchRequest request) {
        // Implementation
    }
    
    @CacheEvict(value = "products", key = "#productId")
    public void updateProduct(UUID productId, UpdateProductRequest request) {
        // Implementation
    }
}
```

### 5. Deployment Configuration

#### 5.1 Docker Configuration

**Application Dockerfile**
```dockerfile
FROM openjdk:17-jdk-slim

WORKDIR /app

COPY target/shopping-platform-*.jar app.jar

RUN addgroup --system appgroup && adduser --system appuser --ingroup appgroup
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
```

**Docker Compose**
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=production
      - DB_HOST=postgres
      - REDIS_HOST=redis
      - KAFKA_BROKERS=kafka:9092
    depends_on:
      - postgres
      - redis
      - kafka
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: shopping_platform
      POSTGRES_USER: app_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  elasticsearch:
    image: elasticsearch:8.8.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data

volumes:
  postgres_data:
  redis_data:
  elasticsearch_data:
```

#### 5.2 Kubernetes Deployment

**Application Deployment**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shopping-platform-app
  labels:
    app: shopping-platform
    tier: application
spec:
  replicas: 3
  selector:
    matchLabels:
      app: shopping-platform
      tier: application
  template:
    metadata:
      labels:
        app: shopping-platform
        tier: application
    spec:
      containers:
      - name: app
        image: shopping-platform:latest
        ports:
        - containerPort: 8080
        env:
        - name: SPRING_PROFILES_ACTIVE
          value: "kubernetes"
        - name: DB_HOST
          value: "postgres-service"
        - name: REDIS_HOST
          value: "redis-service"
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
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: shopping-platform-service
spec:
  selector:
    app: shopping-platform
    tier: application
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer
```

### 6. Monitoring and Observability

#### 6.1 Application Metrics

**Micrometer Configuration**
```java
@Configuration
public class MetricsConfig {
    
    @Bean
    public TimedAspect timedAspect(MeterRegistry registry) {
        return new TimedAspect(registry);
    }
    
    @Bean
    public CounterService counterService(MeterRegistry registry) {
        return new CounterService(registry);
    }
}

@Component
public class BusinessMetrics {
    
    private final Counter orderCounter;
    private final Timer checkoutTimer;
    private final Gauge activeUsersGauge;
    
    public BusinessMetrics(MeterRegistry registry) {
        this.orderCounter = Counter.builder("orders.created")
            .description("Number of orders created")
            .register(registry);
            
        this.checkoutTimer = Timer.builder("checkout.duration")
            .description("Checkout process duration")
            .register(registry);
            
        this.activeUsersGauge = Gauge.builder("users.active")
            .description("Number of active users")
            .register(registry, this, BusinessMetrics::getActiveUserCount);
    }
    
    public void incrementOrderCount() {
        orderCounter.increment();
    }
    
    public void recordCheckoutTime(Duration duration) {
        checkoutTimer.record(duration);
    }
    
    private double getActiveUserCount() {
        // Implementation to get active user count
        return 0.0;
    }
}
```

#### 6.2 Distributed Tracing

**Sleuth Configuration**
```java
@Configuration
public class TracingConfig {
    
    @Bean
    public Sender sender() {
        return OkHttpSender.create("http://zipkin:9411/api/v2/spans");
    }
    
    @Bean
    public AsyncReporter<Span> spanReporter() {
        return AsyncReporter.create(sender());
    }
    
    @Bean
    public Tracing tracing() {
        return Tracing.newBuilder()
            .localServiceName("shopping-platform")
            .spanReporter(spanReporter())
            .sampler(Sampler.create(1.0f))
            .build();
    }
}
```

This comprehensive Low-Level Design document provides detailed implementation specifications for the Online Shopping Platform, covering all architectural components, data flows, security implementations, and deployment configurations required for a production-ready e-commerce system.