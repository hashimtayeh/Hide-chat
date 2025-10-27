const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
app.get('/', (req, res) => {
    res.send('Chat Server is running!');
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ✨ تعديل: سنحتاج لخريطتين
// 1. لتتبع الغرف (من في أي غرفة)
const chatRooms = new Map(); // K: chatId (string) -> V: Set(WebSocket)
// 2. لتتبع المستخدمين (من هو هذا الاتصال؟)
const userConnections = new Map(); // K: userId (string) -> V: WebSocket

console.log('WebSocket server started...');

wss.on('connection', (ws) => {
    console.log('New client connected');
    let currentChatId = null;
    let currentUserId = null; // ✨ جديد: لتخزين هوية هذا المستخدم

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // --- ✨ 1. تحديد هوية المستخدم ---
            // عند فتح الاتصال، يرسل العميل "user_join"
            if (data.type === 'user_join' && data.userId) {
                currentUserId = data.userId;
                userConnections.set(currentUserId, ws);
                console.log(`User ${currentUserId} identified.`);
            }

            // --- ✨ 2. منطق الانضمام للغرف (مُبسط) ---
            // أي رسالة (انضمام أو محادثة) تضعك في الغرفة
            if (data.chatId && data.chatId !== currentChatId) {
                // إزالة العميل من الغرفة القديمة
                if (currentChatId && chatRooms.has(currentChatId)) {
                    chatRooms.get(currentChatId).delete(ws);
                    console.log(`Client left room: ${currentChatId}`);
                }
                
                // إضافة العميل إلى الغرفة الجديدة
                currentChatId = data.chatId;
                if (!chatRooms.has(currentChatId)) {
                    chatRooms.set(currentChatId, new Set());
                }
                chatRooms.get(currentChatId).add(ws);
                console.log(`Client joined/switched to room: ${currentChatId}`);
            }

            // --- ✨ 3. معالجة أنواع الرسائل ---
            switch (data.type) {
                case 'chat_message':
                    // بث رسالة المحادثة للغرفة الحالية
                    if (currentChatId && chatRooms.has(currentChatId)) {
                        chatRooms.get(currentChatId).forEach(client => {
                            if (client !== ws && client.readyState === ws.OPEN) {
                                client.send(message.toString());
                            }
                        });
                    }
                    break;
                
                case 'join_chat':
                    // هذه الرسالة تستخدم فقط لتفعيل الانضمام للغرفة (المنطق أعلاه)
                    // لا نحتاج لعمل أي شيء إضافي هنا
                    break;

                // --- ✨ 4. منطق المكالمات (توجيه 1 إلى 1) ---
                // هذه الرسائل يجب توجيهها لشخص معين، وليس بثها
                case 'webrtc_offer':
                case 'webrtc_answer':
                case 'webrtc_ice_candidate':
                case 'call_end':
                    const targetSocket = userConnections.get(data.to);
                    if (targetSocket && targetSocket.readyState === ws.OPEN) {
                        // أعد إرسال الرسالة كما هي إلى الهدف
                        targetSocket.send(message.toString());
                        console.log(`Forwarded ${data.type} from ${currentUserId} to ${data.to}`);
                    } else {
                        console.warn(`Target user ${data.to} not found or offline.`);
                    }
                    break;
            }
        } catch (error) {
            console.error('Failed to parse message or broadcast:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        // ✨ تنظيف: إزالة المستخدم من الخرائط عند قطع الاتصال
        if (currentUserId) {
            userConnections.delete(currentUserId);
        }
        if (currentChatId && chatRooms.has(currentChatId)) {
            chatRooms.get(currentChatId).delete(ws);
            if (chatRooms.get(currentChatId).size === 0) {
                chatRooms.delete(currentChatId);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
