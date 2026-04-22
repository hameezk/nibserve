import 'package:flutter/material.dart';

void main() {
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
