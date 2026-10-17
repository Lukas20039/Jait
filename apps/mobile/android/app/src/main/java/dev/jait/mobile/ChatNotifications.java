package dev.jait.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/** Shared entry for WebView and FCM alerts. Event dedupe and card replacement are separate. */
final class ChatNotifications {
    private static final String CHANNEL = "jait-chat-completions";
    private ChatNotifications() {}

    static synchronized void clear(Context context, String cardId, String eventId) {
        if (cardId == null || cardId.isEmpty() || eventId == null || eventId.isEmpty()) return;
        // A late FCM completion must not resurrect an event already read elsewhere.
        context.getSharedPreferences(CHANNEL, Context.MODE_PRIVATE).edit()
            .putLong(eventId, System.currentTimeMillis()).apply();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        for (android.service.notification.StatusBarNotification posted : manager.getActiveNotifications()) {
            if (cardId.equals(posted.getTag()) && eventId.equals(posted.getNotification().extras.getString("jait.eventId"))) {
                manager.cancel(cardId, 0);
            }
        }
        PhoneWearListenerService.pushSnapshot(context);
    }

    static void show(Context context, String id, String title, String body) {
        show(context, id, title, body, id, "/chat", NotificationNavigation.scope(context), "", false);
    }

    static void show(Context context, String id, String title, String body, String replaceId,
                     String link, String scope, String sessionId, boolean completion) {
        show(context, id, title, body, replaceId, link, scope, sessionId, completion, null);
    }

    static synchronized void show(Context context, String id, String title, String body, String replaceId,
                     String link, String scope, String sessionId, boolean completion, String markReadLink) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Chat completions", NotificationManager.IMPORTANCE_HIGH);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return;
        String cardId = replaceId == null || replaceId.isEmpty() ? id : replaceId;
        android.content.SharedPreferences prefs = context.getSharedPreferences(CHANNEL, Context.MODE_PRIVATE);
        synchronized (ChatNotifications.class) {
            long now = System.currentTimeMillis();
            // Remember multiple recent events so interleaved chats and delayed FCM deliveries dedupe too.
            if (prefs.contains(id)) return;
            android.content.SharedPreferences.Editor edit = prefs.edit();
            for (java.util.Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
                if (!(entry.getValue() instanceof Long) || now - (Long) entry.getValue() > 3_600_000L) edit.remove(entry.getKey());
            }
            edit.putLong(id, now).apply();
        }
        if (completion && NotificationNavigation.resumed && !sessionId.isEmpty()
            && sessionId.equals(NotificationNavigation.visibleSession)) {
            manager.cancel(cardId, 0);
            return;
        }
        Intent intent = NotificationNavigation.intent(context, cardId, link, scope);
        PendingIntent open = PendingIntent.getActivity(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_jait_notification)
            .setContentTitle(title).setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(open).setAutoCancel(true)
            .setGroup("jait-chats")
            .addAction(R.drawable.ic_jait_notification, "Open chat", open)
            .setLocalOnly(false);
        if (markReadLink != null && markReadLink.startsWith("/messenger?") && !markReadLink.contains("\\")) {
            Intent readIntent = NotificationNavigation.intent(context, cardId, markReadLink, scope);
            readIntent.setData(android.net.Uri.parse("jait-notification://mark-read/" + android.net.Uri.encode(cardId)));
            PendingIntent read = PendingIntent.getActivity(context, 0, readIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            builder.addAction(R.drawable.ic_jait_notification, "Mark as read", read);
        }
        android.os.Bundle extras = new android.os.Bundle();
        extras.putString("jait.eventId", id);
        builder.addExtras(extras);
        manager.notify(cardId, 0, builder.build());
        PhoneWearListenerService.pushSnapshot(context);
    }
}
