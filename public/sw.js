/* global self */
self.addEventListener("push", (event) => {
  event.waitUntil(self.registration.showNotification("오늘 AI와 3분, 함께해요", {
    body: "아직 오늘의 링크가 없어요. 가벼운 미션부터 해보고 23:00까지 남겨주세요.",
    icon: "/icon.svg", tag: "daily-ai-practice", data: { url: "/" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const client = clients.find((item) => new URL(item.url).origin === self.location.origin && new URL(item.url).pathname === "/");
    if (client) return client.focus();
    return self.clients.openWindow("/");
  }));
});
