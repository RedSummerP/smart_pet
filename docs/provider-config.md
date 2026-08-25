# AI Provider 配置（provider-config）

SmartPet 的 AI 层基于 [pi-ai](https://github.com/earendil-works/pi)（统一多厂商 LLM API）。配置格式与 DSH 的 `llm-pi-ai` 块**同构**，可直接复用你已有的习惯与（可选的）`~/.dsh/settings.yaml`。

## 1. 配置文件

- 默认：`~/.smartpet/settings.yaml`（可用环境变量 `SMART_PET_HOME` 覆盖整个数据目录）
- 可选：读取 `~/.dsh/settings.yaml` 作为 provider 来源之一（`mergeProviders: true` 时）

```yaml
# ~/.smartpet/settings.yaml
llm-pi-ai:
  providers:
    deepseek-official:
      displayName: DeepSeek 官方
      apiKeyEnv: DEEPSEEK_API_KEY        # 从环境变量取 key
      # 或 apiKeyRef: keyring://smartpet/deepseek  # 从系统钥匙串取 key（桌面端）
      api: openai-completions
      baseURL: https://api.deepseek.com
      models:
        - id: deepseek-chat
          name: DeepSeek Chat
          contextWindow: 131072
          input: [text]
    sensenova-gateway:
      displayName: 商汤网关
      api: openai-completions
      baseURL: https://token.sensenova.cn/v1
      apiKeyEnv: SENSENOVA_API_KEY
      models:
        - id: deepseek-v4-flash
          name: DeepSeek V4 Flash
          contextWindow: 1048576
          input: [text, image]
  default:
    provider: deepseek-official
    model: deepseek-chat
```

字段与 pi `createProvider` 对应：`id`、`name(displayName)`、`baseUrl`、`auth`、`models`、`api`。

## 2. 密钥安全

- **key 永不写入配置文件**：配置只存引用（`apiKeyEnv` 环境变量名 或 `apiKeyRef` 钥匙串别名）
- 桌面端：OS keyring（Tauri `keyring` 插件，Linux Secret Service / macOS Keychain / Windows Credential Manager）
- Android：Keystore（`SmartPetKeystore` 原生插件）
- 日志/错误信息一律脱敏（沿用 dsh-api-probe 的 `mask_key` 思路）

## 3. 内置 vs 自定义 provider

- **内置**：pi-ai 自带 40+ 厂商（deepseek/openai/anthropic/google/groq/xai/openrouter/…），`@smartpet/ai` 直接 `builtinModels()` 注册
- **自定义 OpenAI 兼容端点**：上述 yaml 写法即可（任何 `/v1/chat/completions` 兼容网关、Ollama、vLLM、llama.cpp）
- **插件扩展**：`providers` capability 可注册 preset（`{ providerId, config }`），设置页一键添加

## 4. 构建与选择

```ts
// @smartpet/ai 内部
const models = createModels();
for (const p of builtinProviders()) models.setProvider(p);   // 内置
for (const cfg of parseSettings().providers) models.setProvider(customProvider(cfg)); // 自定义
const model = models.getModel(settings.default.provider, settings.default.model);
```

模型选择：设置页下拉（provider × model），选中项写入 `llm-pi-ai.default`。

## 5. 密钥输入 UX

设置页"添加 API Key"：选择 provider → 输入 key → 存钥匙串（记 `apiKeyRef`）→ 测试连通（对选中模型发一条极短请求）→ 完成。全程 key 不进配置、不进日志。