import { NextResponse } from 'next/server';
import OpenAI from 'openai';

async function readFileFromFormData(form) {
  const file = form.get('image');
  if (!file) return null;
  // Next.js App Router 中，formData 的文件是 Web File 对象
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, filename: file.name, type: file.type, webFile: file };
}

function createClient() {
  const apiKey = process.env.AIHUBMIX_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 AIHUBMIX_API_KEY 环境变量');
  }
  const client = new OpenAI({ apiKey, baseURL: 'https://aihubmix.com/v1' });
  return client;
}

function extractTextFromResponses(resp) {
  console.log('🔍 开始提取响应文本...');
  console.log('🔍 响应对象存在:', !!resp);
  
  if (!resp) {
    console.log('❌ 响应为空');
    return '';
  }
  
  console.log('🔍 响应类型:', typeof resp);
  console.log('🔍 响应构造函数:', resp.constructor?.name);
  
  // 尝试直接获取文本内容（非流式响应）
  if (typeof resp === 'string') {
    console.log('✅ 发现字符串响应:', resp.substring(0, 100) + '...');
    return resp.trim();
  }
  
  // 检查 output_text 字段
  console.log('🔍 检查 output_text 字段:', typeof resp.output_text);
  if (typeof resp.output_text === 'string' && resp.output_text.trim()) {
    console.log('✅ 从 output_text 提取:', resp.output_text.substring(0, 100) + '...');
    return resp.output_text.trim();
  }
  
  // 检查 output 数组中的内容
  console.log('🔍 检查 output 数组:', Array.isArray(resp.output), resp.output?.length);
  if (Array.isArray(resp.output)) {
    const pieces = [];
    for (let i = 0; i < resp.output.length; i++) {
      const item = resp.output[i];
      console.log(`🔍 处理 output[${i}]:`, typeof item, Object.keys(item || {}));
      
      if (item && typeof item.text === 'string') {
        console.log(`✅ 从 output[${i}].text 找到文本:`, item.text.substring(0, 50) + '...');
        pieces.push(item.text);
      } else if (item && Array.isArray(item.content)) {
        console.log(`🔍 检查 output[${i}].content 数组:`, item.content.length);
        for (let j = 0; j < item.content.length; j++) {
          const c = item.content[j];
          console.log(`🔍 处理 content[${j}]:`, typeof c, Object.keys(c || {}));
          if (c && typeof c.text === 'string') {
            console.log(`✅ 从 content[${j}].text 找到文本:`, c.text.substring(0, 50) + '...');
            pieces.push(c.text);
          }
        }
      }
    }
    if (pieces.length > 0) {
      const result = pieces.join('\n').trim();
      console.log('✅ 从 output 数组组合得到文本:', result.substring(0, 100) + '...');
      return result;
    }
  }
  
  // 检查其他可能的响应格式
  console.log('🔍 检查 choices 数组:', Array.isArray(resp.choices), resp.choices?.length);
  if (resp.choices && Array.isArray(resp.choices)) {
    for (let i = 0; i < resp.choices.length; i++) {
      const choice = resp.choices[i];
      console.log(`🔍 处理 choices[${i}]:`, typeof choice, Object.keys(choice || {}));
      if (choice.message && typeof choice.message.content === 'string') {
        console.log(`✅ 从 choices[${i}].message.content 找到文本:`, choice.message.content.substring(0, 50) + '...');
        return choice.message.content.trim();
      }
    }
  }
  
  // 最后尝试检查所有可能的文本字段
  const possibleFields = ['content', 'text', 'message', 'result'];
  console.log('🔍 检查可能的字段:', possibleFields);
  for (const field of possibleFields) {
    console.log(`🔍 检查字段 ${field}:`, typeof resp[field]);
    if (resp[field] && typeof resp[field] === 'string' && resp[field].trim()) {
      console.log(`✅ 从 ${field} 找到文本:`, resp[field].substring(0, 50) + '...');
      return resp[field].trim();
    }
  }
  
  console.log('❌ 未能从响应中提取到文本内容');
  console.log('🔍 所有可用字段:', Object.keys(resp));
  
  return '';
}

export async function POST(req) {
  try {
    console.log('=== 开始处理图生图优化请求 ===');
    
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

    const client = createClient();
    console.log('✅ OpenAI 客户端创建成功');

    // gpt-5 高级推理优化提示词，结合"图生图"语境（仅返回优化后的 Prompt，不做图片编辑）
    const base64 = fileObj.buffer.toString('base64');
    const dataUrl = `data:${fileObj.type || 'image/png'};base64,${base64}`;
    const outputLang = language === 'zh' ? '中文' : '英文';

    const requestParams = {
      model: 'gpt-5',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                `你是一名资深图像提示词工程师。现在是图生图（image edit）场景，请将以下提示词优化为面向 AI 图像编辑的高质量 ${outputLang} Prompt，要求：\n` +
                '- 强调需要维持参考图的主体构成与关键风格特征，仅在细节、风格或光效上做可控变化；\n' +
                '- 条理化描述：主体、环境、构图、镜头、光照、材质、配色、风格、后期；\n' +
                '- 使用逗号分隔短语，避免长句；\n' +
                '- 输出仅给最终 ' + outputLang + ' Prompt，不要解释。\n\n' +
                `原始提示词（可能是中文）：\n${prompt}`,
            },
            { type: 'input_image', image_url: dataUrl },
          ],
        },
      ],
      reasoning: { effort: 'high' },
      text: { verbosity: 'low' },
      max_output_tokens: 800,
    };

    console.log('📝 构建的请求参数（不含图片数据）:', {
      model: requestParams.model,
      reasoning: requestParams.reasoning,
      text: requestParams.text,
      max_output_tokens: requestParams.max_output_tokens,
      inputText: requestParams.input[0].content[0].text.substring(0, 200) + '...',
      hasImage: !!requestParams.input[0].content[1].image_url
    });

    console.log('🚀 开始调用 gpt-5 API...');
    const resp = await client.responses.create(requestParams);
    console.log('✅ API调用完成');

    // 调试日志：打印响应结构
    console.log('📥 完整API响应:', JSON.stringify(resp, null, 2));
    console.log('📥 响应类型:', typeof resp);
    console.log('📥 响应键:', Object.keys(resp || {}));

    const optimizedPrompt = extractTextFromResponses(resp) || '';
    
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


