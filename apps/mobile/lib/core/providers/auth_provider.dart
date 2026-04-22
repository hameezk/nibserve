import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/auth_service.dart';
import '../services/secure_storage_service.dart';

// Replace with your actual API URL
const String kApiBaseUrl = 'https://api.nibserve.app';

final secureStorageProvider = Provider<SecureStorageService>(
  (_) => SecureStorageService(),
);

final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService(
    baseUrl: kApiBaseUrl,
    storage: ref.read(secureStorageProvider),
  );
});

// Auth state: null = loading, false = not logged in, true = logged in
final authStateProvider = FutureProvider<bool>((ref) async {
  final authService = ref.read(authServiceProvider);
  return authService.isLoggedIn();
});
