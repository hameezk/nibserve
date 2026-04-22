import 'package:flutter/material.dart';

void main() {
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
          child: Text('NibServe — Restaurant Dashboard', style: TextStyle(fontSize: 24)),
        ),
      ),
    );
  }
}
