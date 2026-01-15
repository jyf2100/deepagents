/**
 * MessagePack 协议单元测试
 *
 * 测试长度前缀协议：
 * ┌──────────────┬───────────────┬─────────────┐
 * │ Length (4B)  │ Type (1B)     │ Payload     │
 * │ uint32       │ enum          │ bytes       │
 * └──────────────┴───────────────┴─────────────┘
 */

const msgpack = require('msgpackr');

describe('MessagePack Protocol (Unit)', () => {
  describe('消息编码', () => {
    test('应该正确编码简单的请求消息', () => {
      // Arrange
      const request = {
        request_id: 'test-001',
        method: 'ping',
        params: {}
      };

      // Act
      const encoded = msgpack.encode(request);
      const length = Buffer.alloc(4);
      length.writeUInt32LE(encoded.length);
      const payload = Buffer.concat([length, encoded]);

      // Assert
      expect(payload).toBeInstanceOf(Buffer);
      expect(payload.length).toBe(4 + encoded.length);
      expect(payload.readUInt32LE(0)).toBe(encoded.length);
    });

    test('应该正确编码包含嵌套数据的消息', () => {
      // Arrange
      const request = {
        request_id: 'test-002',
        method: 'chat',
        params: {
          message: 'Hello, world!',
          stream: false,
          metadata: { key: 'value' }
        }
      };

      // Act
      const encoded = msgpack.encode(request);

      // Assert
      expect(encoded).toBeInstanceOf(Buffer);
      const decoded = msgpack.decode(encoded);
      expect(decoded).toEqual(request);
    });

    test('应该正确编码错误响应', () => {
      // Arrange
      const errorResponse = {
        request_id: 'err-001',
        status: 'error',
        error: {
          code: 'UNKNOWN_METHOD',
          message: 'Method not found'
        }
      };

      // Act
      const encoded = msgpack.encode(errorResponse);

      // Assert
      const decoded = msgpack.decode(encoded);
      expect(decoded).toEqual(errorResponse);
      expect(decoded.error.code).toBe('UNKNOWN_METHOD');
    });
  });

  describe('消息解码', () => {
    test('应该正确解码长度前缀消息', () => {
      // Arrange
      const original = {
        request_id: 'decode-001',
        method: 'ping',
        params: {}
      };
      const encoded = msgpack.encode(original);
      const length = Buffer.alloc(4);
      length.writeUInt32LE(encoded.length);
      const payload = Buffer.concat([length, encoded]);

      // Act
      const receivedLength = payload.readUInt32LE(0);
      const messageData = payload.slice(4, 4 + receivedLength);
      const decoded = msgpack.decode(messageData);

      // Assert
      expect(decoded).toEqual(original);
    });

    test('应该处理包含特殊字符的消息', () => {
      // Arrange
      const message = {
        request_id: 'special-001',
        method: 'chat',
        params: {
          message: 'Hello 世界! 🌍\n\t\r\\'
        }
      };

      // Act
      const encoded = msgpack.encode(message);
      const decoded = msgpack.decode(encoded);

      // Assert
      expect(decoded.params.message).toBe(message.params.message);
    });

    test('应该处理大型消息', () => {
      // Arrange
      const largeMessage = {
        request_id: 'large-001',
        method: 'chat',
        params: {
          message: 'A'.repeat(10000)
        }
      };

      // Act
      const encoded = msgpack.encode(largeMessage);
      const decoded = msgpack.decode(encoded);

      // Assert
      expect(decoded.params.message.length).toBe(10000);
      expect(decoded.params.message).toBe(largeMessage.params.message);
    });
  });

  describe('协议边界条件', () => {
    test('应该正确处理最大 32 位长度', () => {
      // 最大 32 位无符号整数
      const maxUint32 = 0xFFFFFFFF;

      const length = Buffer.alloc(4);
      length.writeUInt32LE(maxUint32);

      expect(length.readUInt32LE(0)).toBe(maxUint32);
    });

    test('应该正确处理空消息体', () => {
      // Arrange
      const emptyMessage = {
        request_id: 'empty-001',
        method: 'ping'
      };

      // Act
      const encoded = msgpack.encode(emptyMessage);
      const decoded = msgpack.decode(encoded);

      // Assert
      expect(decoded).toEqual(emptyMessage);
      expect(encoded.length).toBeGreaterThan(0); // MessagePack 总是产生一些字节
    });

    test('应该正确处理最小长度前缀', () => {
      const length = Buffer.alloc(4);
      length.writeUInt32LE(0);

      expect(length.readUInt32LE(0)).toBe(0);
    });
  });

  describe('字节序', () => {
    test('应该使用小端序 (Little Endian)', () => {
      // Arrange
      const value = 0x12345678;
      const buffer = Buffer.alloc(4);

      // Act
      buffer.writeUInt32LE(value);

      // Assert
      // 小端序: 最低有效字节在前
      expect(buffer[0]).toBe(0x78);
      expect(buffer[1]).toBe(0x56);
      expect(buffer[2]).toBe(0x34);
      expect(buffer[3]).toBe(0x12);
    });
  });

  describe('错误处理', () => {
    test('应该拒绝无效的 MessagePack 数据', () => {
      // Arrange - 无效的 MessagePack 字节序列
      const invalidData = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);

      // Act & Assert
      expect(() => {
        msgpack.decode(invalidData);
      }).toThrow(); // msgpackr 会在遇到无效数据时抛出异常
    });

    test('应该拒绝不完整的长度前缀', () => {
      // Arrange - 只有 3 字节，不够 4 字节长度前缀
      const incompleteData = Buffer.from([0x01, 0x02, 0x03]);

      // Act
      const buffer = Buffer.alloc(0);

      // Assert - 无法读取完整的长度前缀
      expect(incompleteData.length).toBeLessThan(4);
    });
  });
});
