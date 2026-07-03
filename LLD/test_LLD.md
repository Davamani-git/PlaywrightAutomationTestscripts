# User Management Module - Low-Level Design Document

## 1. System Architecture & Component Specifications

### 1.1 Microservices Architecture Detail

#### User Service Component
```java
@RestController
@RequestMapping("/api/v1/users")
public class UserController {
    
    @Autowired
    private UserService userService;
    
    @PostMapping("/register")
    @ValidateInput
    @RateLimit(requests = 5, window = "1m")
    public ResponseEntity<UserRegistrationResponse> registerUser(
            @Valid @RequestBody UserRegistrationRequest request) {
        return userService.registerUser(request);
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
    private AuditService auditService;
    
    public UserRegistrationResponse registerUser(UserRegistrationRequest request) {
        // Input validation
        validateUserInput(request);
        
        // Check for existing user
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new UserAlreadyExistsException("User with email already exists");
        }
        
        // Create user entity
        User user = User.builder()
            .userId(UUID.randomUUID())
            .username(request.getUsername())
            .email(request.getEmail())
            .passwordHash(passwordEncoder.encode(request.getPassword()))
            .isActive(false)
            .createdAt(LocalDateTime.now())
            .build();
        
        // Save to database
        User savedUser = userRepository.save(user);
        
        // Audit logging
        auditService.logEvent(AuditEvent.builder()
            .userId(savedUser.getUserId())
            .action("USER_REGISTRATION")
            .timestamp(LocalDateTime.now())
            .result("SUCCESS")
            .build());
        
        // Send verification email
        emailService.sendVerificationEmail(savedUser);
        
        return UserRegistrationResponse.builder()
            .userId(savedUser.getUserId())
            .message("User registered successfully. Please verify email.")
            .build();
    }
}
```

#### Authentication Service Component
```java
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    
    @Autowired
    private AuthService authService;
    
    @PostMapping("/login")
    @RateLimit(requests = 10, window = "1m")
    public ResponseEntity<AuthResponse> authenticate(
            @Valid @RequestBody AuthRequest request,
            HttpServletRequest httpRequest) {
        
        String ipAddress = getClientIpAddress(httpRequest);
        return authService.authenticate(request, ipAddress);
    }
}

@Service
public class AuthService {
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private PasswordEncoder passwordEncoder;
    
    @Autowired
    private JwtTokenProvider jwtTokenProvider;
    
    @Autowired
    private SessionManager sessionManager;
    
    public AuthResponse authenticate(AuthRequest request, String ipAddress) {
        try {
            // Rate limiting check
            if (rateLimitService.isExceeded(request.getEmail(), ipAddress)) {
                throw new RateLimitExceededException("Too many login attempts");
            }
            
            // Retrieve user
            User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new InvalidCredentialsException("Invalid credentials"));
            
            // Account status checks
            if (!user.isActive()) {
                throw new AccountInactiveException("Account is inactive");
            }
            
            if (user.isLocked()) {
                throw new AccountLockedException("Account is locked");
            }
            
            // Password verification
            if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
                handleFailedLogin(user, ipAddress);
                throw new InvalidCredentialsException("Invalid credentials");
            }
            
            // Generate JWT token
            String token = jwtTokenProvider.generateToken(user);
            
            // Create session
            Session session = sessionManager.createSession(user.getUserId(), token, ipAddress);
            
            // Update last login
            user.setLastLogin(LocalDateTime.now());
            userRepository.save(user);
            
            // Audit logging
            auditService.logEvent(AuditEvent.builder()
                .userId(user.getUserId())
                .action("LOGIN_SUCCESS")
                .ipAddress(ipAddress)
                .timestamp(LocalDateTime.now())
                .result("SUCCESS")
                .build());
            
            return AuthResponse.builder()
                .token(token)
                .expiresIn(jwtTokenProvider.getExpirationTime())
                .user(UserDto.from(user))
                .build();
                
        } catch (Exception e) {
            auditService.logEvent(AuditEvent.builder()
                .action("LOGIN_FAILURE")
                .ipAddress(ipAddress)
                .timestamp(LocalDateTime.now())
                .result("FAILURE")
                .errorMessage(e.getMessage())
                .build());
            throw e;
        }
    }
}
```

### 1.2 Data Layer Implementation

#### Entity Definitions
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
    
    @Column(name = "username", unique = true, nullable = false)
    @Size(min = 3, max = 50)
    @Pattern(regexp = "^[a-zA-Z0-9_]+$")
    private String username;
    
    @Column(name = "email", unique = true, nullable = false)
    @Email
    private String email;
    
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;
    
    @Column(name = "is_active")
    private Boolean isActive;
    
    @Column(name = "is_locked")
    private Boolean isLocked;
    
    @Column(name = "failed_login_attempts")
    private Integer failedLoginAttempts;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    @Column(name = "last_login")
    private LocalDateTime lastLogin;
    
    @OneToOne(mappedBy = "user", cascade = CascadeType.ALL)
    private Profile profile;
    
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "user_roles",
        joinColumns = @JoinColumn(name = "user_id"),
        inverseJoinColumns = @JoinColumn(name = "role_id")
    )
    private Set<Role> roles = new HashSet<>();
}

@Entity
@Table(name = "profiles")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Profile {
    
    @Id
    @Column(name = "profile_id")
    private UUID profileId;
    
    @OneToOne
    @JoinColumn(name = "user_id")
    private User user;
    
    @Column(name = "first_name")
    @Encrypted
    private String firstName;
    
    @Column(name = "last_name")
    @Encrypted
    private String lastName;
    
    @Column(name = "phone_number")
    @Encrypted
    private String phoneNumber;
    
    @Column(name = "address")
    @Encrypted
    private String address;
    
    @Column(name = "date_of_birth")
    @Encrypted
    private LocalDate dateOfBirth;
    
    @Column(name = "profile_picture")
    private String profilePicture;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
```

#### Repository Layer
```java
@Repository
public interface UserRepository extends JpaRepository<User, UUID> {
    
    @Query("SELECT u FROM User u WHERE u.email = :email")
    Optional<User> findByEmail(@Param("email") String email);
    
    @Query("SELECT u FROM User u WHERE u.username = :username")
    Optional<User> findByUsername(@Param("username") String username);
    
    @Query("SELECT CASE WHEN COUNT(u) > 0 THEN true ELSE false END FROM User u WHERE u.email = :email")
    boolean existsByEmail(@Param("email") String email);
    
    @Query("SELECT u FROM User u WHERE u.isActive = true AND u.lastLogin < :cutoffDate")
    List<User> findInactiveUsers(@Param("cutoffDate") LocalDateTime cutoffDate);
    
    @Modifying
    @Query("UPDATE User u SET u.failedLoginAttempts = :attempts WHERE u.userId = :userId")
    void updateFailedLoginAttempts(@Param("userId") UUID userId, @Param("attempts") Integer attempts);
}
```

## 2. Detailed Data Flow Diagrams

### 2.1 User Registration Flow
```
sequenceDiagram
    participant Client
    participant API_Gateway
    participant User_Service
    participant Validation_Service
    participant Database
    participant Email_Service
    participant Audit_Service
    
    Client->>API_Gateway: POST /api/v1/users/register
    API_Gateway->>API_Gateway: Rate Limiting Check
    API_Gateway->>User_Service: Forward Request
    User_Service->>Validation_Service: Validate Input
    Validation_Service-->>User_Service: Validation Result
    User_Service->>Database: Check User Exists
    Database-->>User_Service: User Existence Result
    User_Service->>User_Service: Hash Password
    User_Service->>Database: Save User
    Database-->>User_Service: User Saved
    User_Service->>Email_Service: Send Verification Email
    User_Service->>Audit_Service: Log Registration Event
    User_Service-->>API_Gateway: Registration Response
    API_Gateway-->>Client: HTTP 201 Created
```

### 2.2 Authentication Flow
```
sequenceDiagram
    participant Client
    participant API_Gateway
    participant Auth_Service
    participant User_Repository
    participant Session_Manager
    participant JWT_Provider
    participant Audit_Service
    
    Client->>API_Gateway: POST /api/v1/auth/login
    API_Gateway->>Auth_Service: Authentication Request
    Auth_Service->>User_Repository: Find User by Email
    User_Repository-->>Auth_Service: User Entity
    Auth_Service->>Auth_Service: Verify Password
    Auth_Service->>JWT_Provider: Generate Token
    JWT_Provider-->>Auth_Service: JWT Token
    Auth_Service->>Session_Manager: Create Session
    Session_Manager-->>Auth_Service: Session Created
    Auth_Service->>User_Repository: Update Last Login
    Auth_Service->>Audit_Service: Log Login Success
    Auth_Service-->>API_Gateway: Auth Response
    API_Gateway-->>Client: HTTP 200 OK + Token
```

## 3. Security Implementation Details

### 3.1 Input Validation Framework
```java
@Component
public class InputValidator {
    
    private static final String EMAIL_REGEX = "^[A-Za-z0-9+_.-]+@([A-Za-z0-9.-]+\\.[A-Za-z]{2,})$";
    private static final String PASSWORD_REGEX = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{12,}$";
    
    public ValidationResult validateUserRegistration(UserRegistrationRequest request) {
        ValidationResult result = new ValidationResult();
        
        // Email validation
        if (!Pattern.matches(EMAIL_REGEX, request.getEmail())) {
            result.addError("email", "Invalid email format");
        }
        
        // Password validation
        if (!Pattern.matches(PASSWORD_REGEX, request.getPassword())) {
            result.addError("password", "Password must be at least 12 characters with uppercase, lowercase, number, and special character");
        }
        
        // Username validation
        if (request.getUsername().length() < 3 || request.getUsername().length() > 50) {
            result.addError("username", "Username must be between 3 and 50 characters");
        }
        
        // XSS prevention
        request.setUsername(sanitizeInput(request.getUsername()));
        request.setEmail(sanitizeInput(request.getEmail()));
        
        return result;
    }
    
    private String sanitizeInput(String input) {
        return Encode.forHtml(input);
    }
}
```

### 3.2 Encryption Service
```java
@Service
public class EncryptionService {
    
    @Value("${app.encryption.key}")
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
            
            byte[] encryptedText = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            
            byte[] encryptedWithIv = new byte[iv.length + encryptedText.length];
            System.arraycopy(iv, 0, encryptedWithIv, 0, iv.length);
            System.arraycopy(encryptedText, 0, encryptedWithIv, iv.length, encryptedText.length);
            
            return Base64.getEncoder().encodeToString(encryptedWithIv);
            
        } catch (Exception e) {
            throw new EncryptionException("Failed to encrypt data", e);
        }
    }
    
    public String decrypt(String encryptedText) {
        try {
            byte[] decodedText = Base64.getDecoder().decode(encryptedText);
            
            byte[] iv = new byte[GCM_IV_LENGTH];
            System.arraycopy(decodedText, 0, iv, 0, iv.length);
            
            byte[] encrypted = new byte[decodedText.length - GCM_IV_LENGTH];
            System.arraycopy(decodedText, GCM_IV_LENGTH, encrypted, 0, encrypted.length);
            
            SecretKeySpec secretKey = new SecretKeySpec(encryptionKey.getBytes(), "AES");
            
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            GCMParameterSpec parameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH * 8, iv);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, parameterSpec);
            
            byte[] decryptedText = cipher.doFinal(encrypted);
            
            return new String(decryptedText, StandardCharsets.UTF_8);
            
        } catch (Exception e) {
            throw new EncryptionException("Failed to decrypt data", e);
        }
    }
}
```

### 3.3 RBAC Implementation
```java
@Service
public class RBACService {
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private RoleRepository roleRepository;
    
    public boolean hasPermission(UUID userId, String resource, String action) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("User not found"));
        
        return user.getRoles().stream()
            .flatMap(role -> role.getPermissions().stream())
            .anyMatch(permission -> 
                permission.getResource().equals(resource) && 
                permission.getAction().equals(action));
    }
    
    public void assignRole(UUID userId, UUID roleId, UUID assignedBy) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("User not found"));
        
        Role role = roleRepository.findById(roleId)
            .orElseThrow(() -> new RoleNotFoundException("Role not found"));
        
        UserRole userRole = UserRole.builder()
            .userRoleId(UUID.randomUUID())
            .userId(userId)
            .roleId(roleId)
            .assignedAt(LocalDateTime.now())
            .assignedBy(assignedBy)
            .isActive(true)
            .build();
        
        userRoleRepository.save(userRole);
        
        auditService.logEvent(AuditEvent.builder()
            .userId(assignedBy)
            .action("ROLE_ASSIGNMENT")
            .targetUserId(userId)
            .details("Assigned role: " + role.getRoleName())
            .timestamp(LocalDateTime.now())
            .result("SUCCESS")
            .build());
    }
}
```

## 4. Database Schema & Optimization

### 4.1 Database Schema
```sql
-- Users table
CREATE TABLE users (
    user_id UUID PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    failed_login_attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    CONSTRAINT chk_username_format CHECK (username ~ '^[a-zA-Z0-9_]+$'),
    CONSTRAINT chk_email_format CHECK (email ~ '^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$')
);

-- Profiles table
CREATE TABLE profiles (
    profile_id UUID PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    phone_number VARCHAR(20),
    address TEXT,
    date_of_birth DATE,
    profile_picture VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Roles table
CREATE TABLE roles (
    role_id UUID PRIMARY KEY,
    role_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permissions table
CREATE TABLE permissions (
    permission_id UUID PRIMARY KEY,
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resource, action)
);

-- User roles junction table
CREATE TABLE user_roles (
    user_role_id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(user_id),
    UNIQUE(user_id, role_id)
);

-- Audit logs table
CREATE TABLE audit_logs (
    log_id UUID PRIMARY KEY,
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    target_user_id UUID,
    resource VARCHAR(100),
    details TEXT,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    result VARCHAR(20) NOT NULL,
    error_message TEXT,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (target_user_id) REFERENCES users(user_id)
);

-- Sessions table
CREATE TABLE sessions (
    session_id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Indexes for performance optimization
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_active ON users(is_active);
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

## 5. API Specifications

### 5.1 REST API Endpoints
```yaml
openapi: 3.0.3
info:
  title: User Management API
  version: 1.0.0
  description: Enterprise User Management System API

paths:
  /api/v1/users/register:
    post:
      summary: Register new user
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
                $ref: '#/components/schemas/UserRegistrationResponse'
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
              $ref: '#/components/schemas/AuthRequest'
      responses:
        '200':
          description: Authentication successful
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthResponse'
        '401':
          description: Invalid credentials
        '423':
          description: Account locked

components:
  schemas:
    UserRegistrationRequest:
      type: object
      required:
        - username
        - email
        - password
      properties:
        username:
          type: string
          minLength: 3
          maxLength: 50
          pattern: '^[a-zA-Z0-9_]+$'
        email:
          type: string
          format: email
        password:
          type: string
          minLength: 12
        firstName:
          type: string
          maxLength: 255
        lastName:
          type: string
          maxLength: 255
```

## 6. Performance & Monitoring

### 6.1 Caching Strategy
```java
@Service
@CacheConfig(cacheNames = "users")
public class UserCacheService {
    
    @Cacheable(key = "#userId")
    public User getUserById(UUID userId) {
        return userRepository.findById(userId).orElse(null);
    }
    
    @Cacheable(key = "#email")
    public User getUserByEmail(String email) {
        return userRepository.findByEmail(email).orElse(null);
    }
    
    @CacheEvict(key = "#user.userId")
    public void evictUser(User user) {
        // Cache eviction handled by annotation
    }
    
    @CacheEvict(allEntries = true)
    public void evictAllUsers() {
        // Clear all user cache entries
    }
}
```

### 6.2 Monitoring Configuration
```java
@Component
public class UserMetrics {
    
    private final Counter registrationCounter;
    private final Counter loginCounter;
    private final Timer authenticationTimer;
    private final Gauge activeUsersGauge;
    
    public UserMetrics(MeterRegistry meterRegistry) {
        this.registrationCounter = Counter.builder("user.registrations.total")
            .description("Total user registrations")
            .register(meterRegistry);
            
        this.loginCounter = Counter.builder("user.logins.total")
            .description("Total user logins")
            .tag("result", "success")
            .register(meterRegistry);
            
        this.authenticationTimer = Timer.builder("user.authentication.duration")
            .description("Authentication processing time")
            .register(meterRegistry);
            
        this.activeUsersGauge = Gauge.builder("user.active.count")
            .description("Number of active users")
            .register(meterRegistry, this, UserMetrics::getActiveUserCount);
    }
    
    public void incrementRegistrations() {
        registrationCounter.increment();
    }
    
    public void recordAuthenticationTime(Duration duration) {
        authenticationTimer.record(duration);
    }
    
    private double getActiveUserCount() {
        return userRepository.countByIsActiveTrue();
    }
}
```

## 7. Error Handling & Exception Management

### 7.1 Custom Exception Classes
```java
@ResponseStatus(HttpStatus.BAD_REQUEST)
public class ValidationException extends RuntimeException {
    private final List<FieldError> fieldErrors;
    
    public ValidationException(String message, List<FieldError> fieldErrors) {
        super(message);
        this.fieldErrors = fieldErrors;
    }
}

@ResponseStatus(HttpStatus.UNAUTHORIZED)
public class InvalidCredentialsException extends RuntimeException {
    public InvalidCredentialsException(String message) {
        super(message);
    }
}

@ResponseStatus(HttpStatus.LOCKED)
public class AccountLockedException extends RuntimeException {
    public AccountLockedException(String message) {
        super(message);
    }
}
```

### 7.2 Global Exception Handler
```java
@ControllerAdvice
public class GlobalExceptionHandler {
    
    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(ValidationException e) {
        logger.warn("Validation error: {}", e.getMessage());
        
        ErrorResponse errorResponse = ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(HttpStatus.BAD_REQUEST.value())
            .error("Validation Failed")
            .message(e.getMessage())
            .fieldErrors(e.getFieldErrors())
            .build();
            
        return ResponseEntity.badRequest().body(errorResponse);
    }
    
    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<ErrorResponse> handleInvalidCredentials(InvalidCredentialsException e) {
        logger.warn("Authentication failed: {}", e.getMessage());
        
        ErrorResponse errorResponse = ErrorResponse.builder()
            .timestamp(LocalDateTime.now())
            .status(HttpStatus.UNAUTHORIZED.value())
            .error("Authentication Failed")
            .message("Invalid credentials")
            .build();
            
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(errorResponse);
    }
}
```

## 8. Testing Strategy

### 8.1 Unit Test Example
```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {
    
    @Mock
    private UserRepository userRepository;
    
    @Mock
    private PasswordEncoder passwordEncoder;
    
    @Mock
    private AuditService auditService;
    
    @InjectMocks
    private UserService userService;
    
    @Test
    void registerUser_ValidInput_Success() {
        // Given
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .username("testuser")
            .email("test@example.com")
            .password("SecurePassword123!")
            .build();
            
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(false);
        when(passwordEncoder.encode(request.getPassword())).thenReturn("hashedPassword");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        
        // When
        UserRegistrationResponse response = userService.registerUser(request);
        
        // Then
        assertThat(response).isNotNull();
        assertThat(response.getMessage()).contains("registered successfully");
        verify(auditService).logEvent(any(AuditEvent.class));
    }
    
    @Test
    void registerUser_UserExists_ThrowsException() {
        // Given
        UserRegistrationRequest request = UserRegistrationRequest.builder()
            .username("testuser")
            .email("test@example.com")
            .password("SecurePassword123!")
            .build();
            
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(true);
        
        // When & Then
        assertThatThrownBy(() -> userService.registerUser(request))
            .isInstanceOf(UserAlreadyExistsException.class)
            .hasMessage("User with email already exists");
    }
}
```

## 9. Deployment Configuration

### 9.1 Docker Configuration
```dockerfile
FROM openjdk:17-jre-slim

WORKDIR /app

COPY target/user-management-service.jar app.jar

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
```

### 9.2 Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-management-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-management-service
  template:
    metadata:
      labels:
        app: user-management-service
    spec:
      containers:
      - name: user-management-service
        image: user-management-service:latest
        ports:
        - containerPort: 8080
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        - name: DATABASE_USERNAME
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: username
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret
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
```

---

**Document Version**: 1.0  
**Generated From HLD**: test_HLD.md  
**Implementation Language**: Java/Spring Boot  
**Database**: PostgreSQL  
**Last Updated**: $(date)  
**Reviewed By**: Senior Development Team