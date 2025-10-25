// استيراد المكتبات المطلوبة
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

// إعداد خادم Express (للتوافق مع منصات الاستضافة)
const app = express();
app.get('/', (req, res) => {
    res.send('Chat Server is running!');
});

const server = http.createServer(app);

// إعداد خادم WebSocket
const wss = new WebSocketServer({ server });

// هذا هو "دفتر العناوين" الخاص بنا
// سيقوم بتخزين الاتصالات لكل محادثة
// K: chatId (string) -> V: Set(WebSocket)
const chatRooms = new Map();

console.log('WebSocket server started...');

// التعامل مع الاتصالات الجديدة
wss.on('connection', (ws) => {
    console.log('New client connected');
    let currentChatId = null;

    // التعامل مع الرسائل الواردة من هذا العميل
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // تحقق من نوع الرسالة
            if (data.type === 'user_join' || data.type === 'chat_message') {
                
                // 1. الانضمام إلى غرفة (أو تحديثها)
                // إذا كانت هذه أول رسالة أو رسالة انضمام
                if (data.chatId && data.chatId !== currentChatId) {
                    // إزالة العميل من الغرفة القديمة إذا كان موجودًا
                    if (currentChatId && chatRooms.has(currentChatId)) {
                        chatRooms.get(currentChatId).delete(ws);
                    }
                    
                    // إضافة العميل إلى الغرفة الجديدة
                    currentChatId = data.chatId;
                    if (!chatRooms.has(currentChatId)) {
                        chatRooms.set(currentChatId, new Set());
                    }
                    chatRooms.get(currentChatId).add(ws);
                    
                    console.log(`Client ${data.sender || ''} joined chat: ${currentChatId}`);
                }

                // 2. بث الرسالة
                // إذا كانت رسالة محادثة، قم ببثها لجميع الأعضاء في الغرفة
                if (data.type === 'chat_message' && currentChatId) {
                    console.log(`Broadcasting message in room: ${currentChatId}`);
                    
                    const room = chatRooms.get(currentChatId);
                    if (room) {
                        room.forEach(client => {
                            // أرسل الرسالة إلى جميع العملاء الآخرين في الغرفة
                            if (client !== ws && client.readyState === ws.OPEN) {
                                client.send(message.toString());
                            }
                        });
                    }
                }
            }
            
        } catch (error) {
            console.error('Failed to parse message or broadcast:', error);
        }
    });

    // التعامل مع قطع الاتصال
    ws.on('close', () => {
        console.log('Client disconnected');
        // إزالة العميل من الغرفة التي كان فيها
        if (currentChatId && chatRooms.has(currentChatId)) {
            chatRooms.get(currentChatId).delete(ws);
            if (chatRooms.get(currentChatId).size === 0) {
                chatRooms.delete(currentChatId);
            }
            console.log(`Client removed from chat: ${currentChatId}`);
        }
    });

    // التعامل مع الأخطاء
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// تشغيل الخادم
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});