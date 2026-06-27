// Velura AI Stylist Chatbot Controller
document.addEventListener('DOMContentLoaded', () => {
    var form = document.querySelector(".js-chatbot-form");
    var input = document.querySelector(".js-chatbot-input");
    var messagesContainer = document.getElementById("chatbot-messages");
    var switcher = document.querySelector(".js-chatbot-state-select");
    var recsContainer = document.querySelector(".js-chatbot-recommendations");
    var typingIndicator = document.getElementById("typing-indicator");

    // Configuration: n8n local webhook URL for Gemini + RAG
    const N8N_WEBHOOK_URL = 'https://satiable-hazelnut-vending.ngrok-free.dev/webhook-test/velura-chat';  //Thay đường này khi đã hoàn thiện n8n

    var currentMode = "user";
    var sessionIds = {
        user: localStorage.getItem('velura_gemini_sessionId_user') || 'user_' + Math.random().toString(36).substr(2, 9)
    };

    // Save session IDs to keep state across refreshes
    localStorage.setItem('velura_gemini_sessionId_user', sessionIds.user);

    // Escape HTML strings to prevent XSS
    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, function (s) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[s];
        });
    }

    // Format time (HH:MM AM/PM)
    function formatTime(date) {
        var hours = date.getHours();
        var minutes = date.getMinutes();
        var ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        minutes = minutes < 10 ? '0' + minutes : minutes;
        return hours + ':' + minutes + ' ' + ampm;
    }

    // Format bold and italic symbols in AI responses
    function formatMarkdown(text) {
        if (!text) return "";
        let html = escapeHtml(text)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');
        return html;
    }

    // Load Chat History
    function loadChatHistory() {
        if (!messagesContainer) return;
        messagesContainer.innerHTML = "";

        // Welcome Messages
        var welcomeText = "Chào mừng anh/chị đến với Velura! ✨ Em là **AI Stylist** của cửa hàng. Em có thể tư vấn mẫu mã quần áo mới nhất, hỗ trợ chọn size chuẩn và giải đáp các chính sách mua sắm. Anh/chị cần em hỗ trợ gì hôm nay ạ?";

        appendMessage("bot", welcomeText, formatTime(new Date()), true);

        // Load existing history from localStorage
        var historyKey = "velura_gemini_history_" + currentMode;
        var stored = localStorage.getItem(historyKey);
        if (stored) {
            try {
                var messages = JSON.parse(stored);
                messages.forEach(msg => {
                    appendMessage(msg.sender, msg.text, msg.time, false, msg.products || []);
                });
            } catch (e) {
                console.error("Error parsing history:", e);
            }
        }

        // Load sidebar recommendations
        loadRecommendations();
    }

    // Save message to localStorage history
    function saveMessageToHistory(sender, text, time, products = []) {
        var historyKey = "velura_gemini_history_" + currentMode;
        var stored = localStorage.getItem(historyKey);
        var messages = [];
        if (stored) {
            try {
                messages = JSON.parse(stored);
            } catch (e) { }
        }
        messages.push({ sender, text, time, products });
        localStorage.setItem(historyKey, JSON.stringify(messages));
    }

    // Append Message Bubble
    function appendMessage(sender, text, time, isSystemWelcome = false, products = []) {
        var msgEl = document.createElement("div");
        var senderClass = sender === "user" ? "chatbot-message--user" : "chatbot-message--bot";
        var welcomeClass = isSystemWelcome ? " chatbot-message--history" : "";
        msgEl.className = "chatbot-message " + senderClass + welcomeClass;

        let productsHtml = "";
        if (products && products.length > 0) {
            productsHtml = `<div class="chatbot-message__products-grid">`;
            products.forEach(prod => {
                var imgUrl = prod.image_url ? `../${prod.image_url}` : 'https://via.placeholder.com/64?text=Velura';
                var priceStr = parseInt(prod.promo_price || prod.price).toLocaleString('vi-VN') + 'đ';
                productsHtml += `
                    <div class="chatbot-product-card">
                        <img src="${imgUrl}" alt="${escapeHtml(prod.name)}" class="chatbot-product-card__img" onerror="this.src='https://via.placeholder.com/64?text=Velura'" />
                        <div class="chatbot-product-card__info">
                            <h5 class="chatbot-product-card__title">${escapeHtml(prod.name)}</h5>
                            <div class="chatbot-product-card__price-row">
                                <span class="chatbot-product-card__price">${priceStr}</span>
                                <a href="#" class="chatbot-product-card__btn js-product-btn" data-sku="${prod.sku}">Tư vấn</a>
                            </div>
                        </div>
                    </div>
                `;
            });
            productsHtml += `</div>`;
        }

        msgEl.innerHTML = `
            <div class="chatbot-message__text">${formatMarkdown(text)} ${productsHtml}</div>
            <span class="chatbot-message__time">${time}</span>
        `;
        messagesContainer.appendChild(msgEl);

        // Bind click events to product buttons
        msgEl.querySelectorAll('.js-product-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const sku = btn.getAttribute('data-sku');
                if (input) {
                    input.value = `Tư vấn chi tiết cho mình về mã ${sku}`;
                    form.dispatchEvent(new Event('submit'));
                }
            });
        });

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Toggle Typing Indicator
    function showTyping(show) {
        if (typingIndicator) {
            typingIndicator.style.display = show ? "flex" : "none";
        }
    }

    // Load recommendations inside sidebar
    function loadRecommendations() {
        if (!recsContainer) return;

        var recsKey = "velura_gemini_recs_" + currentMode;
        var storedRecs = localStorage.getItem(recsKey);

        recsContainer.innerHTML = "";

        if (storedRecs) {
            try {
                var products = JSON.parse(storedRecs);
                if (products && products.length > 0) {
                    products.forEach(prod => {
                        var itemEl = document.createElement("a");
                        itemEl.className = "recommendation-item";
                        itemEl.href = "#";

                        var imgUrl = prod.image_url ? `../${prod.image_url}` : 'https://via.placeholder.com/64?text=Velura';

                        itemEl.innerHTML = `
                            <img src="${imgUrl}" alt="${escapeHtml(prod.name)}" class="recommendation-item__img" onerror="this.src='https://via.placeholder.com/64?text=Velura'" />
                            <div class="recommendation-item__info">
                                <h4 class="recommendation-item__title">${escapeHtml(prod.name)}</h4>
                                <span class="recommendation-item__price">${parseInt(prod.promo_price || prod.price).toLocaleString('vi-VN')}đ</span>
                            </div>
                        `;

                        // Add click event to trigger chat search
                        itemEl.addEventListener('click', (e) => {
                            e.preventDefault();
                            if (input) {
                                input.value = `Tư vấn chi tiết cho mình về mã ${prod.sku}`;
                                form.dispatchEvent(new Event('submit'));
                            }
                        });

                        recsContainer.appendChild(itemEl);
                    });
                    return;
                }
            } catch (e) {
                console.error("Error parsing recommendations:", e);
            }
        }

        // Fallback display when sidebar empty
        recsContainer.innerHTML = `
            <div class="chatbot-recommendations--empty">
                Chưa có gợi ý phong cách cho bạn. Hãy trò chuyện với AI Stylist hoặc chuyển sang User Mode để xem gợi ý cá nhân hóa!
            </div>
        `;
    }

    // Save recommendations to sidebar
    function saveRecommendations(products) {
        var recsKey = "velura_gemini_recs_" + currentMode;
        localStorage.setItem(recsKey, JSON.stringify(products));
        loadRecommendations();
    }

    // Submit question to n8n Webhook
    function submitQuestion(text) {
        var timeStr = formatTime(new Date());
        appendMessage("user", text, timeStr);
        saveMessageToHistory("user", text, timeStr);

        if (input) input.value = "";

        showTyping(true);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: text,
                sessionId: sessionIds[currentMode],
                mode: currentMode
            })
        })
            .then(res => {
                if (!res.ok) throw new Error("HTTP " + res.status + " from n8n webhook");
                return res.json();
            })
            .then(data => {
                showTyping(false);

                let botText = "";
                let products = [];

                if (typeof data === 'string') {
                    botText = data;
                } else if (data && typeof data === 'object') {
                    botText = data.output || data.text || data.message || "Em đã nhận thông tin ạ.";
                    products = data.products || [];
                }

                var botTimeStr = formatTime(new Date());
                appendMessage("bot", botText, botTimeStr, false, products);
                saveMessageToHistory("bot", botText, botTimeStr, products);

                // If we have recommended products, save and display in sidebar
                if (products && products.length > 0) {
                    saveRecommendations(products);
                }
            })
            .catch(err => {
                console.error("n8n offline or error:", err);
                showTyping(false);

                var botTimeStr = formatTime(new Date());
                var skuMatch = text.match(/\b(SM|TS|QN|DV|AK)\d{3}\b/i);
                var fallbackText;

                if (skuMatch) {
                    var sku = skuMatch[0].toUpperCase();
                    var prefix = sku.slice(0, 2);
                    var catalog = {
                        SM: { name: 'Áo sơ mi lụa Satin Velura', price: '290.000đ', advice: 'mẫu này hợp đi làm, đi cafe hoặc gặp khách. Anh/chị có thể phối với quần tây để thanh lịch, hoặc quần jeans xanh nhạt để trẻ trung hơn.' },
                        TS: { name: 'Áo thun Cotton Basic Velura', price: '180.000đ', advice: 'mẫu này dễ mặc hằng ngày, phối đẹp với jeans, chân váy hoặc khoác ngoài sơ mi mỏng.' },
                        QN: { name: 'Quần Jeans dáng Baggy Denim', price: '290.000đ', advice: 'mẫu này hợp phong cách năng động, phối với áo thun basic hoặc sơ mi form rộng đều đẹp.' },
                        DV: { name: 'Đầm voan tơ dáng dài Velura', price: '320.000đ', advice: 'mẫu này hợp đi tiệc, đi chơi hoặc hẹn hò; phối thêm giày cao gót hoặc giày búp bê sẽ mềm mại hơn.' },
                        AK: { name: 'Áo khoác gió dù 2 lớp Velura', price: '380.000đ', advice: 'mẫu này hợp phối layer, đi nắng nhẹ hoặc đi gió; mặc cùng áo thun basic và jeans sẽ gọn gàng.' }
                    };
                    var item = catalog[prefix];
                    fallbackText = item
                        ? `Dạ với mã **${sku}**, đây là mẫu **${item.name}**. Giá đang hiển thị khoảng **${item.price}**. ${item.advice}\n\nHiện n8n đang trả lỗi (${err.message}), nên em đang dùng tư vấn nhanh trên web. Anh/chị bật lại workflow n8n để em tra chi tiết hơn nhé.`
                        : `Dạ em chưa có dữ liệu rõ cho mã **${sku}**. Hiện n8n đang trả lỗi (${err.message}), anh/chị kiểm tra lại workflow giúp em nhé.`;
                } else {
                    fallbackText = `Em chưa gọi được workflow n8n (${err.message}). Anh/chị kiểm tra webhook đang active và node Agent không lỗi, rồi thử lại giúp em nhé.`;
                }
                appendMessage("bot", fallbackText, botTimeStr);
                saveMessageToHistory("bot", fallbackText, botTimeStr);
            });
    }

    // Form Submit Event Handler
    if (form && input) {
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            var text = input.value.trim();
            if (!text) return;
            submitQuestion(text);
        });
    }

    // Bind Quick Action Buttons
    document.querySelectorAll(".quick-q-btn").forEach(btn => {
        btn.addEventListener("click", function () {
            var question = this.getAttribute("data-question");
            if (question) submitQuestion(question);
        });
    });

    // Initialize Chat
    loadChatHistory();
});
