import 'package:flutter/material.dart';

void main() {
  runApp(const NibServeApp());
}

class NibServeApp extends StatelessWidget {
  const NibServeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NibServe',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFFF6B35)),
        useMaterial3: true,
      ),
      home: const Scaffold(
        body: Center(
          child: Text('NibServe — Customer App', style: TextStyle(fontSize: 24)),
        ),
      ),
    );
  }
}
