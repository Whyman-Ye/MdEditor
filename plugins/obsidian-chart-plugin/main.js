const { Plugin, PluginSettingTab, Setting, MarkdownRenderChild } = require('obsidian');

const DEFAULT_SETTINGS = {
    defaultHeight: 400,
    showDatalabels: true,
    animationDuration: 800
}

// Chart-DSL 宽松解析器 (支持换行/逗号分隔，忽略尾随逗号)
class ChartDSLParser {
    static parse(source) {
        const trimmed = source.trim();
        let withBraces = trimmed;
        if (!trimmed.startsWith('{')) {
            withBraces = '{' + trimmed + '}';
        }
        try {
            return JSON.parse(withBraces);
        } catch (e) {
            return this.parseLoose(trimmed);
        }
    }
    
    static parseLoose(text) {
        let processed = text.trim();
        processed = processed.replace(/\/\*[\s\S]*?\*\//g, '');
        processed = processed.replace(/\/\/[^\n]*/g, '');
        if (!processed.startsWith('{')) {
            processed = '{' + processed + '}';
        }
        try {
            const result = this.parseValue(processed, 0);
            if (result && result.value !== undefined) {
                return result.value;
            }
            throw new Error('解析返回值无效');
        } catch (e) {
            // 增强错误信息：尝试定位行号
            const line = this.getApproximateLine(text, e);
            throw new Error(`第 ${line} 行附近: ${e.message}`);
        }
    }
    
    static getApproximateLine(source, error) {
        // 简单实现：如果错误信息中有位置信息可提取，否则返回1
        return 1;
    }
    
    static parseValue(str, start) {
        str = str.trim();
        if (str === '') return { value: '', index: start };
        if (str.startsWith('{')) return this.parseObject(str);
        if (str.startsWith('[')) return this.parseArray(str);
        return { value: this.parsePrimitive(str), index: start + str.length };
    }
    
    static parseObject(str) {
        const obj = {};
        let content = str.trim();
        if (content.startsWith('{') && content.endsWith('}')) {
            content = content.slice(1, -1).trim();
        }
        if (!content) return { value: obj, index: str.length };
        
        // 使用逗号和换行作为分隔符
        const pairs = this.splitTopLevelFlex(content, [',', '\n']);
        for (const pair of pairs) {
            if (!pair.trim()) continue;
            const colonIndex = this.findTopLevelColon(pair);
            if (colonIndex === -1) continue;
            let key = pair.substring(0, colonIndex).trim();
            let value = pair.substring(colonIndex + 1).trim();
            key = this.unquote(key);
            if (value.startsWith('{')) {
                const parsed = this.parseObject(value);
                obj[key] = parsed.value;
            } else if (value.startsWith('[')) {
                const parsed = this.parseArray(value);
                obj[key] = parsed.value;
            } else {
                obj[key] = this.parsePrimitive(value);
            }
        }
        return { value: obj, index: str.length };
    }
    
    static parseArray(str) {
        const arr = [];
        let content = str.trim();
        if (content.startsWith('[') && content.endsWith(']')) {
            content = content.slice(1, -1).trim();
        }
        if (!content) return { value: arr, index: str.length };
        const items = this.splitTopLevelFlex(content, [',', '\n']);
        for (const item of items) {
            const trimmedItem = item.trim();
            if (!trimmedItem) continue;
            if (trimmedItem.startsWith('{')) {
                const parsed = this.parseObject(trimmedItem);
                arr.push(parsed.value);
            } else if (trimmedItem.startsWith('[')) {
                const parsed = this.parseArray(trimmedItem);
                arr.push(parsed.value);
            } else {
                arr.push(this.parsePrimitive(trimmedItem));
            }
        }
        return { value: arr, index: str.length };
    }
    
    static parsePrimitive(str) {
        str = str.trim();
        if (str === '') return '';
        if (str === 'true') return true;
        if (str === 'false') return false;
        if (str === 'null') return null;
        if (/^-?\d+(\.\d+)?$/.test(str)) return parseFloat(str);
        return this.unquote(str);
    }
    
    static unquote(str) {
        str = str.trim();
        if (str.startsWith('"') && str.endsWith('"')) return str.slice(1, -1);
        if (str.startsWith("'") && str.endsWith("'")) return str.slice(1, -1);
        return str;
    }
    
    // 灵活分割：支持多个分隔符，忽略空项，处理嵌套括号和字符串
    static splitTopLevelFlex(str, delimiters) {
        const result = [];
        let current = '';
        let depth = 0;
        let inString = false;
        let stringChar = '';
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            const prevChar = i > 0 ? str[i - 1] : '';
            if (char === '\\' && prevChar !== '\\') {
                current += char;
                if (i + 1 < str.length) {
                    current += str[i + 1];
                    i++;
                }
                continue;
            }
            if ((char === '"' || char === "'") && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
                current += char;
                continue;
            }
            if (!inString) {
                if (char === '{' || char === '[') depth++;
                else if (char === '}' || char === ']') depth--;
                if (depth === 0 && delimiters.includes(char)) {
                    const trimmed = current.trim();
                    if (trimmed !== '') result.push(trimmed);
                    current = '';
                    continue;
                }
            }
            current += char;
        }
        const trimmed = current.trim();
        if (trimmed !== '') result.push(trimmed);
        return result;
    }
    
    static findTopLevelColon(str) {
        let depth = 0;
        let inString = false;
        let stringChar = '';
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            const prevChar = i > 0 ? str[i - 1] : '';
            if (char === '\\' && prevChar !== '\\') {
                i++;
                continue;
            }
            if ((char === '"' || char === "'") && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
                continue;
            }
            if (!inString) {
                if (char === '{' || char === '[') depth++;
                else if (char === '}' || char === ']') depth--;
                else if (char === ':' && depth === 0) return i;
            }
        }
        return -1;
    }
}

// 图表渲染器
class ChartDSLRenderer extends MarkdownRenderChild {
    constructor(container, code, settings) {
        super(container);
        this.container = container;
        this.code = code;
        this.settings = settings;
        this.chart = null;
    }

    async onload() { await this.render(); }
    onunload() { if (this.chart) this.chart.destroy(); }

    showError(message, details = null) {
        const errorDiv = this.container.createDiv({ cls: 'obsidian-chart-dsl-error' });
        errorDiv.createSpan({ text: `❌ Chart-DSL 错误: ${message}` });
        if (details) {
            const pre = errorDiv.createEl('pre');
            pre.setText(details);
            pre.style.marginTop = '0.5rem';
            pre.style.fontSize = '0.8rem';
            pre.style.overflow = 'auto';
        }
        const retryBtn = errorDiv.createEl('button', { text: '🔄 重试', cls: 'obsidian-chart-dsl-retry-btn' });
        retryBtn.onclick = async () => { errorDiv.remove(); await this.render(); };
    }

    hexToRgba(hex, opacity) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    normalizeConfig(config) {
        if (!config.type) throw new Error('缺少 type 字段 (bar, line, mixed, doughnut, pie)');
        if (!config.labels || !Array.isArray(config.labels)) throw new Error('labels 必须是数组');
        if (!config.datasets || !Array.isArray(config.datasets)) throw new Error('datasets 必须是数组');

        const isMixed = config.type === 'mixed';
        const defaultType = config.type === 'mixed' ? 'bar' : config.type;

        config.datasets.forEach((dataset, idx) => {
            if (!dataset.data || !Array.isArray(dataset.data)) throw new Error(`数据集 ${idx} 缺少 data 数组`);
            const chartType = isMixed ? (dataset.type || defaultType) : config.type;
            dataset.chartType = chartType;

            if (!dataset.backgroundColor && !dataset.color) {
                const colors = ['#3b82f6', '#f97316', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#f59e0b', '#ec4899'];
                dataset.borderColor = colors[idx % colors.length];
                if (chartType === 'bar') dataset.backgroundColor = dataset.borderColor;
                else if (chartType === 'line') dataset.backgroundColor = dataset.fill ? this.hexToRgba(dataset.borderColor, dataset.fillOpacity || 0.2) : 'transparent';
                else if (chartType === 'doughnut' || chartType === 'pie') {
                    if (dataset.colors) dataset.backgroundColor = dataset.colors;
                    else dataset.backgroundColor = dataset.data.map((_, i) => colors[i % colors.length]);
                }
            } else if (dataset.color) {
                dataset.borderColor = dataset.color;
                if (chartType === 'bar') dataset.backgroundColor = dataset.color;
                else if (chartType === 'line') dataset.backgroundColor = dataset.fill ? this.hexToRgba(dataset.color, dataset.fillOpacity || 0.2) : 'transparent';
                delete dataset.color;
            }

            if (chartType === 'bar') {
                dataset.borderRadius = dataset.borderRadius || 6;
                dataset.barPercentage = dataset.barPercentage || 0.7;
                dataset.categoryPercentage = dataset.categoryPercentage || 0.8;
            }
            if (chartType === 'line') {
                dataset.fill = dataset.fill !== undefined ? dataset.fill : false;
                dataset.tension = dataset.tension || 0.3;
                dataset.pointRadius = dataset.pointRadius || 4;
                dataset.borderWidth = dataset.borderWidth || 2;
            }
            if (chartType === 'doughnut' || chartType === 'pie') {
                dataset.cutout = chartType === 'doughnut' ? (dataset.cutout || '60%') : '0%';
                dataset.borderWidth = dataset.borderWidth || 2;
                dataset.borderColor = dataset.borderColor || '#fff';
            }
            dataset.yAxisID = dataset.yAxisID || (dataset.type === 'line' && config.y2Title ? 'y1' : 'y');
        });
        return config;
    }

    buildChartConfig(config) {
        const datasets = config.datasets.map(dataset => {
            const base = {
                label: dataset.label || `数据集`,
                data: dataset.data,
                borderColor: dataset.borderColor,
                backgroundColor: dataset.backgroundColor,
                borderWidth: dataset.borderWidth,
                yAxisID: dataset.yAxisID
            };
            if (dataset.chartType === 'bar') {
                return { ...base, type: 'bar', borderRadius: dataset.borderRadius, barPercentage: dataset.barPercentage, categoryPercentage: dataset.categoryPercentage };
            } else if (dataset.chartType === 'line') {
                return { ...base, type: 'line', fill: dataset.fill, tension: dataset.tension, pointRadius: dataset.pointRadius, pointBackgroundColor: dataset.pointBackgroundColor || dataset.borderColor, pointBorderColor: dataset.pointBorderColor || '#fff' };
            } else if (dataset.chartType === 'doughnut' || dataset.chartType === 'pie') {
                return { ...base, cutout: dataset.cutout, borderRadius: dataset.borderRadius || 0 };
            }
            return base;
        });

        const scales = {};
        if (config.type === 'bar' || config.type === 'line' || config.type === 'mixed') {
            scales.y = { beginAtZero: config.beginAtZero !== false, title: { display: !!config.yTitle, text: config.yTitle || '' }, position: 'left' };
            if (config.y2Title) {
                scales.y1 = { beginAtZero: config.beginAtZero !== false, title: { display: true, text: config.y2Title }, grid: { drawOnChartArea: false }, position: 'right' };
            }
        }

        return {
            type: config.type === 'mixed' ? 'bar' : config.type,
            data: { labels: config.labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: true, animation: { duration: this.settings.animationDuration },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    datalabels: {
                        display: this.settings.showDatalabels, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 6, color: '#1e2f3f',
                        font: { weight: 'bold', size: 11 }, padding: { left: 5, right: 5, top: 3, bottom: 3 },
                        formatter: (value, ctx) => {
                            const ds = ctx.chart.data.datasets[ctx.datasetIndex];
                            if ((ds.type === 'line' || ds.type === 'mixed') && config.y2Title) return value + (config.y2Title.includes('%') ? '%' : '');
                            if (ds.type === 'doughnut' || ds.type === 'pie') {
                                const total = ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0);
                                return `${((value/total)*100).toFixed(1)}%`;
                            }
                            return value;
                        },
                        align: (ctx) => { const ds = ctx.chart.data.datasets[ctx.datasetIndex]; if (ds.type === 'bar') return 'end'; if (ds.type === 'line') return 'top'; return 'center'; }
                    },
                    tooltip: { callbacks: { label: (ctx) => {
                        const label = ctx.dataset.label || '';
                        const val = ctx.raw;
                        if (ctx.dataset.type === 'doughnut' || ctx.dataset.type === 'pie') {
                            const total = ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0);
                            return `${label}: ${val} (${((val/total)*100).toFixed(1)}%)`;
                        }
                        return `${label}: ${val}`;
                    } } },
                    legend: { position: config.legendPosition || 'top' }
                },
                scales: scales
            }
        };
    }

    async render() {
        this.container.empty();
        if (!window.Chart) { this.showError('Chart.js 库未加载，请检查网络连接'); return; }
        if (!this.code || this.code.trim() === '') { this.showError('Chart-DSL 配置为空'); return; }

        try {
            const config = ChartDSLParser.parse(this.code);
            if (!config.type) throw new Error('缺少 type 字段');
            if (!config.labels || !Array.isArray(config.labels)) throw new Error('labels 必须是数组');
            if (!config.datasets || !Array.isArray(config.datasets)) throw new Error('datasets 必须是数组');

            const wrapper = this.container.createDiv({ cls: 'obsidian-chart-dsl-wrapper' });
            if (config.title) wrapper.createEl('div', { cls: 'obsidian-chart-dsl-title', text: config.title });
            const canvas = wrapper.createEl('canvas', { cls: 'obsidian-chart-dsl-canvas' });
            canvas.style.height = `${config.height || this.settings.defaultHeight}px`;
            canvas.style.width = '100%';
            const normalized = this.normalizeConfig(config);
            const chartConfig = this.buildChartConfig(normalized);
            await new Promise(r => setTimeout(r, 50));
            const ctx = canvas.getContext('2d');
            if (ctx) this.chart = new window.Chart(ctx, chartConfig);
        } catch (error) {
            // 显示详细错误信息和代码片段
            let detail = error.message;
            if (this.code) {
                const lines = this.code.split('\n');
                const errorLineMatch = error.message.match(/第\s*(\d+)\s*行/);
                const lineNum = errorLineMatch ? parseInt(errorLineMatch[1]) : 1;
                const start = Math.max(0, lineNum - 2);
                const end = Math.min(lines.length, lineNum + 1);
                const snippet = lines.slice(start, end).join('\n');
                detail += `\n\n代码片段 (第${lineNum}行附近):\n${snippet}`;
            }
            this.showError(error.message, detail);
            console.error('Chart-DSL render error:', error);
        }
    }
}

// 插件主类
module.exports = class ChartDSLPlugin extends Plugin {
    async onload() {
        await this.loadSettings();
        await this.loadChartLibraries();
        
        this.registerMarkdownCodeBlockProcessor('chart-dsl', (source, el, ctx) => {
            if (window.Chart) {
                const renderer = new ChartDSLRenderer(el, source, this.settings);
                ctx.addChild(renderer);
            } else {
                const errorDiv = el.createDiv({ cls: 'obsidian-chart-dsl-error' });
                errorDiv.createSpan({ text: '⚠️ Chart.js 库加载失败，请检查网络连接' });
                this.loadChartLibraries().then(() => {
                    if (window.Chart) {
                        el.empty();
                        const renderer = new ChartDSLRenderer(el, source, this.settings);
                        ctx.addChild(renderer);
                    }
                });
            }
        });

        this.addSettingTab(new ChartDSLSettingTab(this.app, this));
        this.addStyles();
    }

    async loadChartLibraries() {
        return new Promise((resolve) => {
            if (window.Chart) { resolve(); return; }
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js';
            script.onload = () => {
                const pluginScript = document.createElement('script');
                pluginScript.src = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0/dist/chartjs-plugin-datalabels.min.js';
                pluginScript.onload = () => {
                    if (window.Chart && window['chartjs-plugin-datalabels']) window.Chart.register(window['chartjs-plugin-datalabels']);
                    resolve();
                };
                pluginScript.onerror = () => resolve();
                document.head.appendChild(pluginScript);
            };
            script.onerror = () => resolve();
            document.head.appendChild(script);
        });
    }

    onunload() {}

    async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
    async saveSettings() { await this.saveData(this.settings); }

    addStyles() {
        const style = document.createElement('style');
        style.id = 'obsidian-chart-dsl-styles';
        style.textContent = `
            .obsidian-chart-dsl-wrapper { margin: 1rem 0; padding: 1rem; background: var(--background-primary); border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .obsidian-chart-dsl-title { font-size: 1.2rem; font-weight: 600; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--interactive-accent); color: var(--text-normal); }
            .obsidian-chart-dsl-canvas { max-width: 100%; height: auto; }
            .obsidian-chart-dsl-error { padding: 1rem; background: var(--background-modifier-error); color: var(--text-error); border-radius: 8px; margin: 1rem 0; border-left: 4px solid var(--text-error); }
            .obsidian-chart-dsl-retry-btn { margin-top: 0.5rem; padding: 0.3rem 0.8rem; cursor: pointer; background: var(--interactive-accent); color: white; border: none; border-radius: 4px; }
            .obsidian-chart-dsl-retry-btn:hover { background: var(--interactive-accent-hover); }
        `;
        document.head.appendChild(style);
    }
}

class ChartDSLSettingTab extends PluginSettingTab {
    constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Chart-DSL 插件设置' });
        new Setting(containerEl).setName('默认图表高度').setDesc('默认高度（像素）').addText(text => text.setPlaceholder('400').setValue(String(this.plugin.settings.defaultHeight)).onChange(async (v) => { const n=parseInt(v); if(!isNaN(n)){ this.plugin.settings.defaultHeight=n; await this.plugin.saveSettings(); } }));
        new Setting(containerEl).setName('显示数据标签').setDesc('显示数值').addToggle(toggle => toggle.setValue(this.plugin.settings.showDatalabels).onChange(async (v) => { this.plugin.settings.showDatalabels=v; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('动画持续时间').setDesc('毫秒').addSlider(slider => slider.setLimits(0,2000,100).setValue(this.plugin.settings.animationDuration).setDynamicTooltip().onChange(async (v) => { this.plugin.settings.animationDuration=v; await this.plugin.saveSettings(); }));
    }
}