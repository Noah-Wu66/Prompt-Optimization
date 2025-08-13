import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const prompt = formData.get('prompt');
    const language = formData.get('language') || 'zh';
    const firstFrame = formData.get('firstFrame');
    const lastFrame = formData.get('lastFrame');

    // 验证输入（提示词改为选填，仅要求首尾帧）
    if (!firstFrame || !lastFrame) {
      return NextResponse.json(
        { error: '缺少必要参数：首帧或尾帧图片' },
        { status: 400 }
      );
    }

    // 获取API密钥
    const apiKey = process.env.AIHUBMIX_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API密钥未配置' },
        { status: 500 }
      );
    }

    // 将图片转换为Base64，并检查大小
    const firstFrameBuffer = await firstFrame.arrayBuffer();
    const lastFrameBuffer = await lastFrame.arrayBuffer();

    // 检查图片大小，如果过大则提示用户
    const maxSize = 20 * 1024 * 1024; // 20MB限制（每张图片）
    if (firstFrameBuffer.byteLength > maxSize) {
      return NextResponse.json(
        { error: `首帧图片过大（${Math.round(firstFrameBuffer.byteLength / 1024 / 1024)}MB），请压缩至20MB以下` },
        { status: 400 }
      );
    }
    if (lastFrameBuffer.byteLength > maxSize) {
      return NextResponse.json(
        { error: `尾帧图片过大（${Math.round(lastFrameBuffer.byteLength / 1024 / 1024)}MB），请压缩至20MB以下` },
        { status: 400 }
      );
    }

    const firstFrameBase64 = Buffer.from(firstFrameBuffer).toString('base64');
    const lastFrameBase64 = Buffer.from(lastFrameBuffer).toString('base64');

    // 构建Gemini API请求
    const outputLang = language === 'zh' ? '中文' : '英文';
    const systemPrompt = language === 'en'
      ? `You are a professional video prompt optimization expert. Analyze the provided first and last frame images, understand the transition process between them, and optimize the user's prompt to create a high-quality English video generation prompt that describes the smooth transition from the first frame to the last frame.

Please follow these guidelines:
- Integrate all elements (subjects, scenes, actions, camera movements, lighting changes, materials, colors, style, rhythm, etc.) into one coherent and fluent description;
- Use comma-separated phrases, avoid long sentences and paragraphs;
- Output as a single paragraph (no line breaks); English only; no Chinese or translations; limit to 50 words;
- Focus on describing dynamic elements, camera movements and temporal changes;
- Fill in missing but common and reasonable dynamic details;
- Do not include video specifications, duration, frame rate and other technical parameters (such as 4K, 30fps, 16:9, etc.);
- Output only the final English Prompt, no explanations.`
      : `你是专业的视频提示词优化专家。请分析提供的首帧和尾帧图片，理解两者之间的过渡过程，并优化用户的提示词，生成面向 AI 视频生成的高质量 ${outputLang} Prompt，描述从首帧到尾帧的平滑过渡。

请遵循以下准则：
- 将各种要素（主体、场景、动作、镜头运动、时间轴、光照变化、材质、配色、风格、节奏等）融合在一段连贯流畅的描述中；
- 使用逗号分隔短语，避免长句和分段；
- 输出为单段（不要分段）；仅用中文，不得出现任何英文或翻译；不超过100字；
- 重点描述动态元素、镜头运动和时间变化；
- 尽量补全缺失但常见且合理的动态细节；
- 不要包含视频规格、时长、帧率等技术参数（如 4K, 30fps, 16:9 等）；
- 输出仅给最终 ${outputLang} Prompt，不要解释。`;

    const requestBody = {
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${systemPrompt}\n\n用户原始提示词：${(typeof prompt === 'string' ? prompt.trim() : '') || '(用户未提供提示词，请严格依据两张图片自行推断最可能的过渡方式，并直接输出高质量完整Prompt。)'}`
            },
            {
              inline_data: {
                mime_type: firstFrame.type,
                data: firstFrameBase64
              }
            },
            {
              inline_data: {
                mime_type: lastFrame.type,
                data: lastFrameBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.8,
        maxOutputTokens: 64000,
        thinking_config: {
          thinking_budget: 16000
        }
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        }
      ]
    };

    // 调用Gemini API - 使用与其他功能一致的代理端点
    console.log('🚀 准备调用Gemini API...');
    console.log('📋 请求体大小:', JSON.stringify(requestBody).length, '字符');
    console.log('📋 图片信息:', {
      firstFrame: { type: firstFrame.type, size: firstFrameBase64.length },
      lastFrame: { type: lastFrame.type, size: lastFrameBase64.length }
    });

    // 添加超时和重试机制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时

    let response;
    try {
      response = await fetch(
        `https://aihubmix.com/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Connection': 'keep-alive'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    console.log('📡 Gemini API响应状态:', response.status, response.statusText);
    console.log('📡 响应头:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API错误:', errorText);

      // 根据错误状态码提供更具体的错误信息
      let errorMessage = 'AI服务暂时不可用，请稍后重试';
      if (response.status === 413) {
        errorMessage = '图片文件过大，请压缩后重试';
      } else if (response.status === 429) {
        errorMessage = '请求过于频繁，请稍后重试';
      } else if (response.status >= 500) {
        errorMessage = '服务器内部错误，请稍后重试';
      }

      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    // 创建流式响应 - 与其他API保持一致的格式和错误处理
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let completeText = '';
          let hasReceivedData = false;
          let hasMaxTokensIssue = false;

          console.log('🔄 开始处理首尾帧视频流式响应...');

          while (true) {
            let readResult;
            try {
              readResult = await reader.read();
            } catch (readError) {
              console.error('❌ 读取流数据时发生错误:', readError);
              if (readError.name === 'AbortError') {
                throw new Error('请求超时，请检查网络连接或稍后重试');
              }
              throw new Error('网络连接中断，请重试');
            }

            const { done, value } = readResult;
            if (done) {
              console.log('📡 流式读取完成');
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            hasReceivedData = true;
            console.log('📦 收到数据块:', chunk.length, '字符');
            console.log('📦 数据块内容:', JSON.stringify(chunk));
            console.log('📦 当前缓冲区总长度:', buffer.length);

            // 优先按 Gemini 的 JSON 数组流式格式解析
            try {
              const jsonMatch = buffer.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                const currentJSON = jsonMatch[0];
                console.log('🔍 发现完整JSON数组，长度:', currentJSON.length);
                const responseArray = JSON.parse(currentJSON);

                // 从响应数组中提取文本
                let extractedText = '';
                for (const item of responseArray) {
                  if (item.candidates && item.candidates[0]) {
                    const candidate = item.candidates[0];

                    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                      console.warn('⚠️ 内容被过滤或遇到问题:', candidate.finishReason);
                      if (candidate.finishReason === 'SAFETY') {
                        throw new Error('内容被安全过滤器阻止，请尝试修改提示词或图片');
                      } else if (candidate.finishReason === 'MAX_TOKENS') {
                        console.warn('⚠️ 达到最大token限制，可能是图片过大或提示词过长');
                        hasMaxTokensIssue = true;
                      }
                    }

                    const parts = candidate.content?.parts;
                    if (parts && parts[0]?.text) {
                      extractedText += parts[0].text;
                    }
                  }
                }

                // 语言输出约束：在服务端剔除不需要的语言片段（仅对中文模式强制）
                const sanitizeForLanguage = (text) => {
                  if (language === 'zh') {
                    // 保留第一个段落（常见场景：中文后面紧跟一个空行+英文翻译）
                    const paraSplit = text.split(/\r?\n\r?\n/);
                    let s = (paraSplit[0] || text);
                    // 若下一行以英文开头（如 From ...），去掉从该行开始的内容
                    s = s.replace(/\n[ A-Za-z].*$/s, '');
                    return s.trim();
                  } else if (language === 'en') {
                    // 可选：去掉明显的中文段落
                    return text.replace(/[\u4e00-\u9fa5].*$/s, '').trim();
                  }
                  return text;
                };

                const sanitizedText = sanitizeForLanguage(extractedText);

                if (sanitizedText && sanitizedText !== completeText) {
                  const delta = sanitizedText.slice(completeText.length);
                  if (delta) {
                    console.log('📝 发送文本增量:', delta.length, '字符');
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`));
                    completeText = sanitizedText;
                  }
                }
              }
            } catch (parseError) {
              // 忽略解析错误，继续累积数据，等待更多块到来
              console.log('🔍 等待更多数据以完成JSON解析...');
            }
          }

          console.log('✅ 首尾帧视频流式响应处理完成');
          console.log('📊 最终统计:');
          console.log('  - 累计文本长度:', completeText.length);
          console.log('  - 累计文本内容:', JSON.stringify(completeText.substring(0, 200) + (completeText.length > 200 ? '...' : '')));

          // 如果没有收到任何文本内容，发送错误信息
          if (completeText.length === 0) {
            console.warn('⚠️ 没有收到任何文本内容，可能是API调用失败或内容被过滤');
            let errorText;
            if (hasMaxTokensIssue) {
              errorText = '图片文件过大，导致处理超出限制。请将图片压缩至20MB以下后重试，或尝试使用更简洁的提示词。';
            } else if (!hasReceivedData) {
              errorText = '网络连接问题，请检查网络状态后重试。如果问题持续，可能是图片文件过大，请压缩后重试。';
            } else {
              errorText = '抱歉，无法处理您的图片。请检查图片是否清晰可见，或尝试修改提示词。';
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: errorText })}\n\n`));
          }

          // 发送完成事件 - 使用与其他API一致的格式
          const completeEvent = { type: 'response.completed' };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeEvent)}\n\n`));
        } catch (error) {
          console.error('❌ 首尾帧视频流处理错误:', error);

          // 根据错误类型提供更具体的错误信息
          let errorMessage = String(error);
          if (error.message && error.message.includes('terminated')) {
            errorMessage = '网络连接被中断，可能是图片文件过大或网络不稳定。请尝试压缩图片或检查网络连接后重试。';
          } else if (error.message && error.message.includes('timeout')) {
            errorMessage = '请求超时，请检查网络连接或稍后重试。';
          } else if (error.message && error.message.includes('AbortError')) {
            errorMessage = '请求被取消，请重试。';
          }

          const errorEvent = {
            type: 'response.error',
            error: { message: errorMessage }
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });

  } catch (error) {
    console.error('API路由错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}