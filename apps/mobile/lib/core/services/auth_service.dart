import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'secure_storage_service.dart';

class AuthService {
  final Dio _dio;
  final SecureStorageService _storage;
  final FirebaseAuth _firebaseAuth;

  AuthService({
    required String baseUrl,
    SecureStorageService? storage,
    FirebaseAuth? firebaseAuth,
  })  : _dio = Dio(BaseOptions(baseUrl: baseUrl)),
        _storage = storage ?? SecureStorageService(),
        _firebaseAuth = firebaseAuth ?? FirebaseAuth.instance;

  /// Step 1: send OTP to phone number
  Future<void> sendOtp({
    required String phoneNumber,
    required void Function(String verificationId) onCodeSent,
    required void Function(String error) onError,
  }) async {
    await _firebaseAuth.verifyPhoneNumber(
      phoneNumber: phoneNumber,
      verificationCompleted: (PhoneAuthCredential credential) async {
        // Auto-retrieval or instant verification
        await _signInWithCredential(credential, onError: onError);
      },
      verificationFailed: (FirebaseAuthException e) {
        onError(e.message ?? 'Verification failed');
      },
      codeSent: (String verificationId, int? resendToken) {
        onCodeSent(verificationId);
      },
      codeAutoRetrievalTimeout: (_) {},
    );
  }

  /// Step 2: verify OTP and sign in to our backend
  Future<Map<String, dynamic>> verifyOtp({
    required String verificationId,
    required String smsCode,
  }) async {
    final credential = PhoneAuthProvider.credential(
      verificationId: verificationId,
      smsCode: smsCode,
    );
    return _signInWithCredential(credential);
  }

  Future<Map<String, dynamic>> _signInWithCredential(
    PhoneAuthCredential credential, {
    void Function(String)? onError,
  }) async {
    final userCredential = await _firebaseAuth.signInWithCredential(credential);
    final idToken = await userCredential.user!.getIdToken();

    final response = await _dio.post<Map<String, dynamic>>(
      '/api/auth/verify',
      data: {'idToken': idToken},
    );

    final data = response.data!;
    await _storage.saveTokens(
      accessToken: data['accessToken'] as String,
      refreshToken: data['refreshToken'] as String,
    );
    return data;
  }

  Future<void> logout() async {
    final refreshToken = await _storage.getRefreshToken();
    if (refreshToken != null) {
      try {
        await _dio.post<void>(
          '/api/auth/logout',
          data: {'refreshToken': refreshToken},
        );
      } catch (_) {}
    }
    await _firebaseAuth.signOut();
    await _storage.clearTokens();
  }

  Future<bool> isLoggedIn() async {
    final token = await _storage.getAccessToken();
    return token != null;
  }
}
