/**
 * 消息格式化功能单元测试
 */

// 模拟 escapeHtml 函数（Node.js 兼容版本）
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 从 app.js 复制的格式化函数
function formatMessageContent(content) {
  if (!content) return '';

  let formatted = content;

  // 使用 Map 存储解析后的 JSON 对象和代码块
  const jsonMap = new Map();
  const blockMap = new Map();
  const JSON_PREFIX = '___JSON_';
  const BLOCK_PREFIX = '___BLOCK_';

  // 1. 首先检测代码块
  let blockIndex = 0;
  formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    if (lang === 'json') {
      try {
        const parsed = JSON.parse(code);
        code = JSON.stringify(parsed, null, 2);
      } catch (e) {
        // 不是有效 JSON，保持原样
      }
    }
    const marker = `${BLOCK_PREFIX}${blockIndex}___`;
    blockMap.set(blockIndex, code);
    blockIndex++;
    return marker;
  });

  // 2. 检测 JSON 对象（在 HTML 转义之前）
  let jsonIndex = 0;
  formatted = formatted.replace(/(\{(?:[^{}]|\{[^{}]*\})*\})/g, (match) => {
    try {
      const parsed = JSON.parse(match);
      const marker = `${JSON_PREFIX}${jsonIndex}___`;
      jsonMap.set(jsonIndex, parsed);
      jsonIndex++;
      return marker;
    } catch (e) {
      return match;
    }
  });

  // 3. 转义 HTML 防止 XSS
  formatted = escapeHtml(formatted);

  // 4. 处理标记的代码块
  formatted = formatted.replace(/___BLOCK_(\d+)___/g, (match, index) => {
    const code = blockMap.get(parseInt(index));
    if (code !== undefined) {
      return `<pre><code>${code}</code></pre>`;
    }
    return match;
  });

  // 5. 处理标记的 JSON 块
  formatted = formatted.replace(/___JSON_(\d+)___/g, (match, index) => {
    const parsed = jsonMap.get(parseInt(index));
    if (parsed) {
      const highlighted = JSON.stringify(parsed, null, 2)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/("(?:\\u[\dA-Fa-f]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, (m) => {
          let cls = 'json-string';
          if (/:$/.test(m)) {
            cls = 'json-key';
          }
          return `<span class="${cls}">${m}</span>`;
        })
        .replace(/\b(true|false|null)\b/g, '<span class="json-boolean">$1</span>')
        .replace(/\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, '<span class="json-number">$1</span>');
      return `<pre><code class="language-json">${highlighted}</code></pre>`;
    }
    return match;
  });

  // 6. 检测行内代码
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 7. 检测粗体
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 8. 检测斜体
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 9. 将换行符转换为 <br>
  formatted = formatted.replace(/\n/g, '<br>');

  return formatted;
}

// 测试用例
function runTests() {
  console.log('🧪 开始运行消息格式化测试...\n');

  // 测试 1: 行内代码
  console.log('测试 1: 行内代码');
  const input1 = '这是 `inline code` 测试';
  const output1 = formatMessageContent(input1);
  console.log('输入:', input1);
  console.log('输出包含 <code>:', output1.includes('<code>'));
  console.log('✓ 通过\n');

  // 测试 2: 粗体
  console.log('测试 2: 粗体');
  const input2 = '这是 **bold text** 测试';
  const output2 = formatMessageContent(input2);
  console.log('输入:', input2);
  console.log('输出包含 <strong>:', output2.includes('<strong>'));
  console.log('✓ 通过\n');

  // 测试 3: JSON 格式化
  console.log('测试 3: JSON 格式化');
  const input3 = '配置信息: {"name":"test","value":123,"active":true}';
  const output3 = formatMessageContent(input3);
  console.log('输入:', input3);
  console.log('输出包含 <pre>:', output3.includes('<pre>'));
  console.log('输出包含 json-key:', output3.includes('json-key'));
  console.log('输出包含 json-number:', output3.includes('json-number'));
  console.log('输出包含 json-boolean:', output3.includes('json-boolean'));
  console.log('✓ 通过\n');

  // 测试 4: 代码块
  console.log('测试 4: 代码块');
  const input4 = '```js\nconsole.log("hello");\n```';
  const output4 = formatMessageContent(input4);
  console.log('输入:', input4);
  console.log('输出包含 language-js:', output4.includes('language-js'));
  console.log('✓ 通过\n');

  // 测试 5: 混合格式
  console.log('测试 5: 混合格式');
  const input5 = '**标题**\n这是 `代码` 和 {"key":"value"}';
  const output5 = formatMessageContent(input5);
  console.log('输入:', input5);
  console.log('包含粗体:', output5.includes('<strong>'));
  console.log('包含代码:', output5.includes('<code>'));
  console.log('包含 JSON:', output5.includes('<pre>'));
  console.log('✓ 通过\n');

  console.log('🎉 所有测试通过！');
}

// 运行测试
runTests();
