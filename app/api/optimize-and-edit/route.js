import { NextResponse } from 'next/server';

async function readFileFromFormData(form) {
  const file = form.get('image');
  if (!file) return null;
  // Next.js App Router 中，formData 的文件是 Web File 对象
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, filename: file.name, type: file.type, webFile: file };
}

function getApiKey() {
  const apiKey = process.env.AIHUBMIX_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 AIHUBMIX_API_KEY 环境变量');
  }
  return apiKey;
}

function extractTextFromResponse(response) {
  console.log('🔍 开始提取Gemini响应文本...');
  
  if (!response) {
    console.log('❌ 响应为空');
    return '';
  }
  
  console.log('🔍 响应类型:', typeof response);
  
  // 尝试从candidates中提取文本
  if (response.candidates && Array.isArray(response.candidates)) {
    console.log('🔍 检查candidates数组，长度:', response.candidates.length);
    for (let i = 0; i < response.candidates.length; i++) {
      const candidate = response.candidates[i];
      console.log(`🔍 处理candidates[${i}]:`, typeof candidate);
      
      if (candidate.content && candidate.content.parts && Array.isArray(candidate.content.parts)) {
        console.log(`🔍 检查候选项${i}的parts数组，长度:`, candidate.content.parts.length);
        let texts = [];
        for (const part of candidate.content.parts) {
          if (part.text) {
            console.log('✅ 找到文本内容:', part.text.substring(0, 50) + '...');
            texts.push(part.text);
          }
        }
        if (texts.length > 0) {
          const result = texts.join('').trim();
          console.log('✅ 成功提取文本，长度:', result.length);
          return result;
        }
      }
    }
  }
  
  console.log('❌ 未能从Gemini响应中提取到文本内容');
  console.log('🔍 响应对象所有键:', Object.keys(response));
  
  return '';
}

export async function POST(req) {
  try {
    console.log('=== 开始处理图生图优化请求（Gemini Fetch） ===');
    
    const form = await req.formData();
    const prompt = form.get('prompt');
    const language = form.get('language') || 'en';
    
    console.log('请求参数:', { 
      prompt: prompt?.substring(0, 100) + '...', 
      language,
      hasFile: !!form.get('image')
    });
    
    if (!prompt || typeof prompt !== 'string') {
      console.log('❌ 提示词验证失败:', prompt);
      return NextResponse.json({ error: '提示词不能为空' }, { status: 400 });
    }

    console.log('✅ 提示词验证通过，长度:', prompt.length);

    const fileObj = await readFileFromFormData(form);
    if (!fileObj) {
      console.log('❌ 图片文件验证失败');
      return NextResponse.json({ error: '请上传参考图片' }, { status: 400 });
    }

    console.log('✅ 图片文件验证通过:', {
      filename: fileObj.filename,
      type: fileObj.type,
      size: fileObj.buffer.length
    });

    const apiKey = getApiKey();
    console.log('✅ API密钥获取成功');

    const outputLang = language === 'zh' ? '中文' : '英文';
    const optimizeInput = `你是一名资深图像提示词工程师。现在是图生图（image edit）场景，请将以下提示词优化为面向 AI 图像编辑的高质量 ${outputLang} Prompt，要求：
- 强调需要维持参考图的主体构成与关键风格特征，仅在细节、风格或光效上做可控变化；
- 条理化描述：主体、环境、构图、镜头、光照、材质、配色、风格、后期；
- 使用逗号分隔短语，避免长句；
- 不要包含画幅比例、尺寸规格等技术参数（如 3:2 aspect ratio, 16:9, 1024x1024 等）；
- 输出仅给最终 ${outputLang} Prompt，不要解释。

原始提示词（可能是中文）：
${prompt}`;

    console.log('📝 构建的优化输入:', optimizeInput.substring(0, 200) + '...');

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

    console.log('🚀 开始调用 Gemini API...');
    const response = await fetch('https://aihubmix.com/gemini/v1/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API调用失败:', response.status, errorText);
      throw new Error(`Gemini API 调用失败: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ API调用完成');

    // 调试日志：打印响应结构
    console.log('📥 完整API响应:', JSON.stringify(data, null, 2));
    console.log('📥 响应类型:', typeof data);
    console.log('📥 响应键:', Object.keys(data || {}));

    const optimizedPrompt = extractTextFromResponse(data) || '';
    
    // 调试日志：打印提取的结果
    console.log('🔍 提取的优化提示词:', optimizedPrompt);
    console.log('🔍 提取结果长度:', optimizedPrompt.length);
    console.log('🔍 是否使用回退:', optimizedPrompt ? '否' : '是，使用原提示词');

    const finalResult = optimizedPrompt || prompt;
    console.log('📤 最终返回结果:', finalResult.substring(0, 100) + '...');
    console.log('=== 请求处理完成 ===');

    return NextResponse.json({ optimizedPrompt: finalResult, language });
  } catch (err) {
    console.error('❌ API调用出错:', err);
    console.error('❌ 错误详情:', {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    return NextResponse.json({ error: err.message || '服务器错误' }, { status: 500 });
  }
}