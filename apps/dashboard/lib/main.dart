import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const NibServeDashboardApp());
}

class NibServeDashboardApp extends StatelessWidget {
  const NibServeDashboardApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NibServe Dashboard',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF4CAF50)),
        useMaterial3: true,
      ),
      home: const Scaffold(
        body: Center(
          child: Text('NibServe — Restaurant Dashboard',
              style: TextStyle(fontSize: 24)),
        ),
      ),
    );
  }
}
