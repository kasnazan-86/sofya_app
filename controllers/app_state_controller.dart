import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

class AppStateController extends ChangeNotifier {
  String? role;
  DocumentSnapshot? activeTrip;
  DocumentSnapshot? incomingTrip; // للسائق
  bool isLoading = true;

  final _auth = FirebaseAuth.instance;
  final _db = FirebaseFirestore.instance;

  void init() async {
    final user = _auth.currentUser;
    if (user == null) return;

    final userDoc =
        await _db.collection('users').doc(user.uid).get();

    role = userDoc.data()?['role'];

    if (role == 'rider') {
      _listenRiderTrips(user.uid);
    }

    if (role == 'driver') {
      _listenDriverTrips(user.uid);
      _listenIncomingTrips();
    }

    isLoading = false;
    notifyListeners();
  }

  void _listenRiderTrips(String uid) {
    _db
        .collection('trips')
        .where('riderId', isEqualTo: uid)
        .where('status',
            whereIn: ['requested', 'accepted', 'started'])
        .snapshots()
        .listen((snapshot) {
      activeTrip =
          snapshot.docs.isEmpty ? null : snapshot.docs.first;
      notifyListeners();
    });
  }

  void _listenDriverTrips(String uid) {
    _db
        .collection('trips')
        .where('driverId', isEqualTo: uid)
        .where('status',
            whereIn: ['accepted', 'started'])
        .snapshots()
        .listen((snapshot) {
      activeTrip =
          snapshot.docs.isEmpty ? null : snapshot.docs.first;
      notifyListeners();
    });
  }

  void _listenIncomingTrips() {
    _db
        .collection('trips')
        .where('status', isEqualTo: 'requested')
        .snapshots()
        .listen((snapshot) {
      incomingTrip =
          snapshot.docs.isEmpty ? null : snapshot.docs.first;
      notifyListeners();
    });
  }

  Future<void> createTrip() async {
    final user = _auth.currentUser;

    await _db.collection('trips').add({
      "riderId": user!.uid,
      "driverId": null,
      "status": "requested",
      "fare": 0,
      "platformCommission": 0,
      "driverAmount": 0,
      "charged": false,
      "createdAt": FieldValue.serverTimestamp(),
    });
  }

  Future<void> acceptTrip(String tripId) async {
    final user = _auth.currentUser;

    await _db.collection('trips').doc(tripId).update({
      "driverId": user!.uid,
      "status": "accepted",
    });
  }

  Future<void> startTrip(String tripId) async {
    await _db.collection('trips').doc(tripId).update({
      "status": "started",
      "startedAt": FieldValue.serverTimestamp(),
    });
  }
}