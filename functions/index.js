const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.completeTrip = functions.https.onCall(async (data, context) => {

  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Authentication required"
    );
  }

  const tripId = data.tripId;

  if (!tripId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Trip ID required"
    );
  }

  const tripRef = db.collection("trips").doc(tripId);

  return db.runTransaction(async (tx) => {

    const tripSnap = await tx.get(tripRef);

    if (!tripSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Trip not found"
      );
    }

    const trip = tripSnap.data();

    if (trip.status !== "started") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Trip not active"
      );
    }

    if (trip.charged === true) {
      throw new functions.https.HttpsError(
        "already-exists",
        "Trip already charged"
      );
    }

    const riderWalletRef = db.collection("wallets").doc(trip.riderId);
    const driverWalletRef = db.collection("wallets").doc(trip.driverId);

    const riderWalletSnap = await tx.get(riderWalletRef);
    const driverWalletSnap = await tx.get(driverWalletRef);

    if (!riderWalletSnap.exists || !driverWalletSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Wallet missing"
      );
    }

    const riderBalance = riderWalletSnap.data().balance || 0;
    const driverBalance = driverWalletSnap.data().balance || 0;

    if (riderBalance < trip.fare) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Insufficient balance"
      );
    }

    const commission = trip.platformCommission || 0;
    const driverAmount = trip.driverAmount || (trip.fare - commission);

    // خصم من الراكب
    tx.update(riderWalletRef, {
      balance: riderBalance - trip.fare,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // إضافة للسائق
    tx.update(driverWalletRef, {
      balance: driverBalance + driverAmount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // تحديث الرحلة
    tx.update(tripRef, {
      status: "completed",
      charged: true,
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // تسجيل المعاملة
    const transactionRef = db.collection("transactions").doc();
    tx.set(transactionRef, {
      tripId: tripId,
      riderId: trip.riderId,
      driverId: trip.driverId,
      amount: trip.fare,
      commission: commission,
      currency: "IQD",
      type: "trip_payment",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // تسجيل العمولة
    const commissionRef = db.collection("commissions").doc();
    tx.set(commissionRef, {
      tripId: tripId,
      amount: commission,
      currency: "IQD",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
  });
});