import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const NibServeDriverApp());
}

class NibServeDriverApp extends StatelessWidget {
  const NibServeDriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NibServe Driver',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2196F3)),
        useMaterial3: true,
      ),
      home: const Scaffold(
        body: Center(
          child: Text('NibServe — Driver App', style: TextStyle(fontSize: 24)),
        ),
      ),
    );
  }
}
