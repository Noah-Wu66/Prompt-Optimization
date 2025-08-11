import { NextResponse } from 'next/server';

async function readFileFromFormData(form) {
  const file = form.get('image');
  if (!file) return null;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, filename: file.name, type: file.type };
}

function getApiKey() {
  const apiKey = process.env.AIHUBMIX_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 AIHUBMIX_API_KEY 环境变量');
  }
  return apiKey;
}

export async function POST(req) {
  try {
    const form = await req.formData();
    const prompt = form.get('prompt');
    const language = form.get('language') || 'en';
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: '提示词不能为空' }, { status: 400 });
    }
    const fileObj = await readFileFromFormData(form);
    if (!fileObj) {
      return NextResponse.json({ error: '请上传参考图片' }, { status: 400 });
    }

    const apiKey = getApiKey();
    const outputLang = language === 'zh' ? '中文' : '英文';
    const optimizeInput = `你是一名资深图像提示词工程师。现在是图生图（image edit）场景，请将以下提示词优化为面向 AI 图像编辑的高质量 ${outputLang} Prompt，要求：
- 强调需要维持参考图的主体构成与关键风格特征，仅在细节、风格或光效上做可控变化；
- 将各种要素（主体、环境、构图、镜头、光照、材质、配色、风格、后期等）融合在一段连贯流畅的描述中；
- 使用逗号分隔短语，避免长句和分段；
- 不要包含画幅比例、尺寸规格等技术参数（如 3:2 aspect ratio, 16:9, 1024x1024 等）；
- 输出仅给最终 ${outputLang} Prompt，不要解释。

原始提示词（可能是中文）：
${prompt}`;

    // 将图片转换为base64
    const base64Image = fileObj.buffer.toString('base64');
    const mimeType = fileObj.type || 'image/png';

    const requestBody = {
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: optimizeInput
            },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image
              }
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

    // 根据错误信息，需要在查询参数中包含key
    const apiUrl = `https://aihubmix.com/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}`;
    console.log('🌐 图生图 API请求详情:');
    console.log('- 端点:', apiUrl.replace(apiKey, '***'));
    console.log('- 模型:', requestBody.model);
    console.log('- 图片MIME类型:', mimeType);
    console.log('- 图片大小:', Math.round(base64Image.length / 1024), 'KB');
    console.log('- 请求体大小:', JSON.stringify(requestBody).length, '字符');
    console.log('- API Key方式:', '查询参数');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('📡 API响应状态:', response.status, response.statusText);
    console.log('📡 响应头:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API错误响应:', errorText);
      console.error('❌ 请求体（不含图片数据）:', JSON.stringify({
        ...requestBody,
        contents: requestBody.contents.map(c => ({
          ...c,
          parts: c.parts.map(p => p.inline_data ? { inline_data: '(base64图片数据已隐藏)' } : p)
        }))
      }, null, 2));
      throw new Error(`Gemini API 调用失败: ${response.status} - ${errorText}`);
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let completeText = '';

          console.log('🔄 开始处理图生图流式响应...');

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            console.log('📦 收到数据块:', chunk.length, '字符');
            
            // Gemini 流式响应可能是逐个字符或单词发送的
            // 我们累积所有数据，然后尝试解析完整的JSON
            let currentJSON = '';
            try {
              // 尝试找到完整的JSON响应
              const jsonMatch = buffer.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                currentJSON = jsonMatch[0];
                const responseArray = JSON.parse(currentJSON);
                
                // 从响应数组中提取所有文本
                let extractedText = '';
                for (const item of responseArray) {
                  if (item.candidates && item.candidates[0] && item.candidates[0].content) {
                    const parts = item.candidates[0].content.parts;
                    if (parts && parts[0] && parts[0].text) {
                      extractedText += parts[0].text;
                    }
                  }
                }
                
                // 如果有新的文本内容，发送增量
                if (extractedText && extractedText !== completeText) {
                  const delta = extractedText.slice(completeText.length);
                  if (delta) {
                    console.log('📝 发送文本增量:', delta.length, '字符');
                    const event = {
                      type: 'response.output_text.delta',
                      delta: delta
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                    completeText = extractedText;
                  }
                }
              }
            } catch (parseError) {
              // 忽略解析错误，继续累积数据
              console.log('🔍 等待更多数据以完成JSON解析...');
            }
          }

          console.log('✅ 图生图流式响应处理完成，总文本长度:', completeText.length);

          // 发送完成事件
          const completeEvent = { type: 'response.completed' };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeEvent)}\n\n`));
        } catch (e) {
          console.error('❌ 流式处理错误:', e);
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