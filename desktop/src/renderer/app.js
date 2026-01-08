const messagesDiv = document.getElementById('messages');
const input = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

let isProcessing = false;

function addMessage(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = content;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function sendMessage() {
  const message = input.value.trim();
  if (!message || isProcessing) return;

  isProcessing = true;
  sendBtn.disabled = true;
  addMessage('user', message);
  input.value = '';

  try {
    const response = await window.deepagents.chat(message);
    addMessage('assistant', response.content);
  } catch (error) {
    addMessage('assistant', `Error: ${error.message}`);
  } finally {
    isProcessing = false;
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// 监听流式响应
window.deepagents.onResponse((data) => {
  if (data.status === 'success') {
    addMessage('assistant', data.data.content);
  }
});
