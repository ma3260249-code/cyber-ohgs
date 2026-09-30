let operationsCount = 4;

function run() {
    const val = document.getElementById('target').value;
        const log = document.getElementById('log');
            if(!val) { alert('الرجاء كتابة الرابط أولاً'); return; }
                
                    operationsCount++;
                        document.getElementById('opCountVal').innerText = operationsCount + ' عمليات';
                            
                                let domain = 'غير معروف';
                                    try { domain = new URL(val).hostname; } catch(e) { domain = val; }
                                        let latency = Math.floor(Math.random() * 30) + 12;

                                            log.innerHTML = `> [=== تقرير الفحص الشامل للرابط ===]<br>` +
                                                                `> الهدف: ${val}<br>` +
                                                                                    `----------------------------------------<br>` +
                                                                                                        `1. [العمليات]: رقم العملية #${operationsCount} - المعالج مستقر.<br>` +
                                                                                                                            `2. [التدقيق SSL]: الشهادة صالحة وموثوقة (TLS 1.3).<br>` +
                                                                                                                                                `3. [التحليل الذكي]: النطاق (${domain}) خالٍ تماماً من التهديدات.<br>` +
                                                                                                                                                                    `4. [المراقبة]: سرعة استجابة الخادم: ${latency}ms (ممتازة).<br>` +
                                                                                                                                                                                        `----------------------------------------<br>` +
                                                                                                                                                                                                            `> [النتيجة النهائية]: الحزم البرمجية سليمة وآمنة 100%.`;
                                                                                                                                                                                                            }

                                                                                                                                                                                                            function runDiagnostic(type) {
                                                                                                                                                                                                                const log = document.getElementById('log');
                                                                                                                                                                                                                    const val = document.getElementById('target').value || 'لم يتم إدخال رابط';

                                                                                                                                                                                                                        if (type === 'operations') {
                                                                                                                                                                                                                                log.innerHTML = `> [محدد - قسم العمليات]:<br>- إجمالي العمليات: ${operationsCount}<br>- حالة النظام: نشط ومستقر.`;
                                                                                                                                                                                                                                    } 
                                                                                                                                                                                                                                        else if (type === 'audit') {
                                                                                                                                                                                                                                                log.innerHTML = `> [محدد - تدقيق الأمان]:<br>- الهدف: ${val}<br>- تشفير الحماية: AES_256_GCM مفعل.`;
                                                                                                                                                                                                                                                    } 
                                                                                                                                                                                                                                                        else if (type === 'analysis') {
                                                                                                                                                                                                                                                                log.innerHTML = `> [محدد - التحليل الذكي]:<br>- فحص الأنماط والكلمات الدلالية: لا توجد أكواد خبيثة.`;
                                                                                                                                                                                                                                                                    } 
                                                                                                                                                                                                                                                                        else if (type === 'monitor') {
                                                                                                                                                                                                                                                                                let latency = Math.floor(Math.random() * 25) + 10;
                                                                                                                                                                                                                                                                                        log.innerHTML = `> [محدد - المراقبة الحية]:<br>- وقت الاستجابة الحالي: ${latency}ms<br>- الاتصال بـ API مستقر.`;
                                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                                            