import { NextResponse } from 'next/server';

function getApiKey() {
  const apiKey = process.env.AIHUBMIX_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 AIHUBMIX_API_KEY 环境变量');
  }
  return apiKey;
}

export async function POST(req) {
  try {
    const { prompt, language = 'en' } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: '提示词不能为空' }, { status: 400 });
    }

    const apiKey = getApiKey();
    const outputLang = language === 'zh' ? '中文' : '英文';
    const optimizeInput = `你是一名资深图像提示词工程师。请将以下提示词优化为面向通用 AI 图像生成模型的高质量 ${outputLang} Prompt，要求：
- 用简洁清晰的结构描述主体、场景、造型、构图、镜头、光照、材质、配色、风格、后期等；
- 使用逗号分隔短语，避免长句；
- 尽量补全缺失但常见且合理的细节；
- 不要包含画幅比例、尺寸规格等技术参数（如 3:2 aspect ratio, 16:9, 1024x1024 等）；
- 输出仅给最终 ${outputLang} Prompt，不要解释。

原始提示词（可能是中文）：
${prompt}`;

    const requestBody = {
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: optimizeInput
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.8,
        maxOutputTokens: 2048,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        }
      ]
    };

    const response = await fetch('https://aihubmix.com/gemini/v1/models/gemini-2.5-flash:streamGenerateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Gemini API 调用失败: ${response.status}`);
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            
            // 处理多个JSON对象，按行分割
            const lines = buffer.split('\n');
            buffer = lines.pop(); // 保留不完整的行

            for (const line of lines) {
              const trimmedLine = line.trim();
              if (trimmedLine && trimmedLine !== 'data: [DONE]') {
                try {
                  // 移除 "data: " 前缀
                  const jsonStr = trimmedLine.startsWith('data: ') ? 
                    trimmedLine.slice(6) : trimmedLine;
                  
                  if (jsonStr) {
                    const data = JSON.parse(jsonStr);
                    
                    // 提取文本内容
                    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                      const parts = data.candidates[0].content.parts;
                      if (parts && parts[0] && parts[0].text) {
                        const event = {
                          type: 'response.output_text.delta',
                          delta: parts[0].text
                        };
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                      }
                    }
                  }
                } catch (parseError) {
                  console.log('解析JSON失败:', parseError, '原始数据:', trimmedLine);
                }
              }
            }
          }

          // 发送完成事件
          const completeEvent = { type: 'response.completed' };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeEvent)}\n\n`));
        } catch (e) {
          const errorEvent = { 
            type: 'response.error', 
            error: { message: String(e) } 
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    console.error('Streaming route error:', err);
    return NextResponse.json({ error: err.message || '服务器错误' }, { status: 500 });
  }
}