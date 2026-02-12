import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

type SortOrder = 'desc' | 'asc'

const rawData: Record<string, number> = {
  福建: 3500,
  浙江: 3100,
  北京: 2900,
  上海: 1600,
  天津: 1000,
  江苏: 1000,
  山东: 800,
  四川: 800,
  湖南: 800,
  安徽: 800,
  河北: 800,
  重庆: 500,
  辽宁: 500,
  江西: 500,
  黑龙江: 500,
  河南: 400,
  陕西: 400,
  甘肃: 400,
  湖北: 400,
  内蒙古: 300,
  山西: 300,
  青海: 300,
  西藏: 300,
  广西: 270,
  广东: 50
}

const maxValue = Math.max(...Object.values(rawData))

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// 省会城市坐标映射
const CAPITAL_COORDS: Record<string, [number, number]> = {
  '北京市': [116.4074, 39.9042],
  '天津市': [117.2008, 39.0841],
  '上海市': [121.4737, 31.2304],
  '重庆市': [106.5507, 29.5630],
  '河北省': [114.5025, 38.0455],
  '山西省': [112.5492, 37.8570],
  '辽宁省': [123.4290, 41.7943],
  '吉林省': [125.3245, 43.8868],
  '黑龙江省': [126.6424, 45.7570],
  '江苏省': [118.7969, 32.0603],
  '浙江省': [120.1536, 30.2875],
  '安徽省': [117.2272, 31.8206],
  '福建省': [119.3062, 26.0753],
  '江西省': [115.8921, 28.6765],
  '山东省': [117.0009, 36.6758],
  '河南省': [113.6654, 34.7480],
  '湖北省': [114.2986, 30.5844],
  '湖南省': [112.9388, 28.2280],
  '广东省': [113.2644, 23.1292],
  '海南省': [110.3312, 20.0319],
  '四川省': [104.0657, 30.6595],
  '贵州省': [106.7135, 26.5783],
  '云南省': [102.7123, 25.0406],
  '陕西省': [108.9402, 34.3416],
  '甘肃省': [103.8236, 36.0581],
  '青海省': [101.7789, 36.6232],
  '台湾省': [121.5090, 25.0443],
  '内蒙古自治区': [111.6708, 40.8183],
  '广西壮族自治区': [108.3200, 22.8240],
  '西藏自治区': [91.1322, 29.6604],
  '宁夏回族自治区': [106.2782, 38.4664],
  '新疆维吾尔自治区': [87.6177, 43.7928],
  '香港特别行政区': [114.1734, 22.3200],
  '澳门特别行政区': [113.5439, 22.1987]
};

const uiConfigDefaults = {
  titleColor: '#ffffff',
  titleFontSize: 24,
  topTextColor: '#ffffff',
  topTextFontSize: 48,
  provinceLabelColor: '#ffffff',
  provinceNameFontSize: 8,
  provinceLabelFontSize: 12,
  provinceLabelBgColor: 'rgba(255, 77, 79, 0.9)',
  provinceLabelOffsetY: 0,
  visualMapColors: ['#1e293b', '#3b82f6', '#60a5fa']
}

const nameMap: Record<string, string> = {
  北京: '北京市',
  天津: '天津市',
  上海: '上海市',
  重庆: '重庆市',
  河北: '河北省',
  山西: '山西省',
  内蒙古: '内蒙古自治区',
  辽宁: '辽宁省',
  吉林: '吉林省',
  黑龙江: '黑龙江省',
  江苏: '江苏省',
  浙江: '浙江省',
  安徽: '安徽省',
  福建: '福建省',
  江西: '江西省',
  山东: '山东省',
  河南: '河南省',
  湖北: '湖北省',
  湖南: '湖南省',
  广东: '广东省',
  广西: '广西壮族自治区',
  海南: '海南省',
  四川: '四川省',
  贵州: '贵州省',
  云南: '云南省',
  西藏: '西藏自治区',
  陕西: '陕西省',
  甘肃: '甘肃省',
  青海: '青海省',
  宁夏: '宁夏回族自治区',
  新疆: '新疆维吾尔自治区',
  香港: '香港特别行政区',
  澳门: '澳门特别行政区',
  台湾: '台湾省'
}

const normalizeName = (name: string) => nameMap[name] ?? name

export default function App() {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const centersRef = useRef<Record<string, [number, number]>>({})
  const [mapReady, setMapReady] = useState(false)
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [stepDelay, setStepDelay] = useState(600)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [statusText, setStatusText] = useState('等待播放')
  const [titleText, setTitleText] = useState('中国省份数据分布')
  const [titleFontSize, setTitleFontSize] = useState(24)
  const [titleColor, setTitleColor] = useState('#ffffff')
  const [currentStep, setCurrentStep] = useState(0)
  const [_currentProvinceInfo, setCurrentProvinceInfo] = useState({ name: '', value: 0, key: 0 })

  // JSON 数据输入状态
  const [jsonInput, setJsonInput] = useState(JSON.stringify(rawData, null, 2))
  const [parsedData, setParsedData] = useState(rawData)

  // 解析 JSON 输入
  const handleJsonChange = (value: string) => {
    setJsonInput(value)
    try {
      const parsed = JSON.parse(value)
      setParsedData(parsed)
      setStatusText('数据已更新')
    } catch (e) {
      setStatusText('JSON 格式错误')
    }
  }

  // 示例数据
  const exampleData = {
    "广东": 5000,
    "江苏": 4500,
    "山东": 4000,
    "浙江": 3500,
    "河南": 3000,
    "四川": 2800,
    "湖北": 2500,
    "福建": 2200,
    "湖南": 2000,
    "安徽": 1800,
    "河北": 1600,
    "陕西": 1400,
    "江西": 1200,
    "重庆": 1000,
    "辽宁": 900,
    "云南": 800,
    "山西": 700,
    "贵州": 600,
    "吉林": 500,
    "甘肃": 400,
    "黑龙江": 300,
    "内蒙古": 200,
    "新疆": 100
  }

  const loadExampleData = () => {
    const exampleJson = JSON.stringify(exampleData, null, 2)
    setJsonInput(exampleJson)
    handleJsonChange(exampleJson)
  }

  const orderedEntries = useMemo(() => {
    const entries = Object.entries(parsedData)
    entries.sort((a, b) => (sortOrder === 'desc' ? b[1] - a[1] : a[1] - b[1]))
    return entries
  }, [sortOrder, parsedData])
  
  // UI 样式配置状态
  const [provinceNameFontSize, setProvinceNameFontSize] = useState(uiConfigDefaults.provinceNameFontSize)
  const [labelFontSize, setLabelFontSize] = useState(uiConfigDefaults.provinceLabelFontSize)
  const [labelBgColor, setLabelBgColor] = useState(uiConfigDefaults.provinceLabelBgColor)
  const [mapZoom, setMapZoom] = useState(1.9)
  const [mapCenterX, setMapCenterX] = useState(107)
  const [mapCenterY, setMapCenterY] = useState(36)
  
  // 视觉映射颜色状态
  const [visualMapColors, setVisualMapColors] = useState(uiConfigDefaults.visualMapColors)
  
  // 地图上方文字（标题下方）样式状态
  const [topTextFontSize, setTopTextFontSize] = useState(uiConfigDefaults.topTextFontSize)
  const [topTextColor, setTopTextColor] = useState(uiConfigDefaults.topTextColor)

  const buildBaseOption = (isExport = false) => {
    const scale = isExport ? 2.5 : 1
    
    return {
      backgroundColor: '#0b1220',
      title: {
        text: titleText,
        left: 'center',
        top: 40,
        textStyle: {
          color: titleColor,
          fontSize: titleFontSize,
          fontWeight: 'bold',
          fontFamily: "'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', sans-serif"
        }
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) =>
          `${params.name}: ${params.value ?? 0}`
      },
      visualMap: {
        min: 0,
        max: maxValue,
        left: 'center',
        bottom: 50 * scale,
        orient: 'horizontal',
        itemWidth: 20 * scale,
        itemHeight: 140 * scale,
        text: ['高', '低'],
        textStyle: { 
          color: '#cbd5f5',
          fontSize: 12 * scale
        },
        inRange: { color: visualMapColors },
        calculable: true,
        seriesIndex: [0]
      },
      geo: {
        map: 'china',
        roam: false,
        zoom: mapZoom,
        center: [mapCenterX, mapCenterY],
        label: { 
          show: true,
          color: '#ffffff',
          fontSize: provinceNameFontSize * scale
        },
        regions: [
          { name: '香港特别行政区', label: { show: false } },
          { name: '澳门特别行政区', label: { show: false } },
          { name: '香港', label: { show: false } },
          { name: '澳门', label: { show: false } }
        ],
        itemStyle: {
          areaColor: '#1e293b',
          borderColor: '#334155',
          borderWidth: 1 * scale
        },
        emphasis: {
          label: { 
            show: true, 
            color: '#fff',
            fontSize: provinceNameFontSize * scale * 1.2
          },
          itemStyle: { areaColor: '#2563eb' }
        }
      },
      series: [
        {
          name: '数据值',
          type: 'map',
          geoIndex: 0,
          data: [],
          silent: true
        },
        {
          name: '当前高亮',
          type: 'map',
          geoIndex: 0,
          z: 10,
          itemStyle: {
            areaColor: 'rgba(255, 77, 79, 0.8)',
            borderColor: '#ff4d4f',
            borderWidth: 2 * scale
          },
          label: {
            show: false
          },
          data: []
        },
        {
          name: '数值标签',
          type: 'scatter',
          coordinateSystem: 'geo',
          z: 50,
          symbol: 'pin',
          symbolSize: () => labelFontSize * 3.5 * scale,
          itemStyle: {
            color: labelBgColor,
            shadowBlur: 10 * scale,
            shadowColor: 'rgba(0,0,0,0.5)'
          },
          silent: true,
          label: {
            show: true,
            formatter: (params: any) => `${params.value[2]}`,
            color: uiConfigDefaults.provinceLabelColor,
            fontSize: labelFontSize * scale,
            fontWeight: 'bold',
            position: 'inside',
            offset: [0, -4 * scale],
            textAlign: 'center',
            verticalAlign: 'middle'
          },
          data: []
        }
      ]
    }
  }

  useEffect(() => {
    if (!chartRef.current || instanceRef.current) return
    instanceRef.current = echarts.init(chartRef.current)

    resizeObserverRef.current = new ResizeObserver(() => {
      instanceRef.current?.resize()
    })
    resizeObserverRef.current.observe(chartRef.current)

    return () => {
      resizeObserverRef.current?.disconnect()
      instanceRef.current?.dispose()
      instanceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!instanceRef.current || mapReady) return
    const loadMap = async () => {
      const response = await fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json')
      const geoJson = await response.json()
      echarts.registerMap('china', geoJson)
      const centers: Record<string, [number, number]> = {}
      try {
        for (const f of geoJson.features ?? []) {
          const name: string = f.properties?.name
          // 尝试多个可能的中心点属性
          const cp = f.properties?.cp || f.properties?.center || f.properties?.centroid
          if (name && Array.isArray(cp)) {
            centers[name] = [Number(cp[0]), Number(cp[1])]
          }
        }
        console.log('Map centers loaded:', Object.keys(centers).length, centers)
      } catch (err) {
        console.error('Error parsing map centers:', err)
      }
      centersRef.current = centers
      setMapReady(true)
    }
    loadMap()
  }, [mapReady])

  useEffect(() => {
    if (!instanceRef.current || !mapReady) return
    instanceRef.current.setOption(buildBaseOption())
  }, [mapReady, titleText, titleFontSize, titleColor, provinceNameFontSize, labelFontSize, labelBgColor, mapZoom, mapCenterX, mapCenterY, topTextFontSize, topTextColor, visualMapColors])

  const renderDataTo = (instance: echarts.ECharts | null, count: number) => {
    if (!instance) return Promise.resolve()
    const entries = orderedEntries.slice(0, count)
    const currentName = entries[count - 1]?.[0] || ''
    const currentValue = entries[count - 1]?.[1] || 0
    
    const baseData = entries.map(([name, value]) => ({ 
      name: normalizeName(name), 
      value 
    }))

    const highlightData = currentName ? [{
      name: normalizeName(currentName),
      value: currentValue
    }] : []

    const labelData = entries.map(([name, value]) => {
      const norm = normalizeName(name)
      
      // 隐藏香港和澳门的数值标签（气泡）
      if (norm === '香港特别行政区' || norm === '澳门特别行政区') {
        return null
      }

      const capitalCoord = CAPITAL_COORDS[norm]

      if (capitalCoord) {
        return {
          name: norm,
          value: [...capitalCoord, value]
        }
      }

      const coord = centersRef.current[norm]
      if (!coord) return null
      return {
        name: norm,
        value: [...coord, value]
      }
    }).filter(Boolean)

    return new Promise<void>((resolve) => {
      const text = currentName ? `${currentName}：${currentValue}` : ''

      // 1. 更新 React 状态（仅用于同步 UI，不再用于动画）
      setCurrentProvinceInfo({
        name: currentName,
        value: currentValue,
        key: Date.now()
      });

      let settled = false
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const handleFinished = () => {
        if (settled) return
        settled = true
        instance?.off('finished', handleFinished)
        if (timeoutId) clearTimeout(timeoutId)
        resolve()
      }
      instance.on('finished', handleFinished)
      timeoutId = setTimeout(handleFinished, 800)

      // 2. 统一使用 ECharts Graphic 渲染飞入动画
      // 使用 replace 模式更新 graphic，确保旧的文字被清除
      const chartOption: any = {
        series: [
          { data: baseData },
          { data: highlightData },
          { data: labelData }
        ],
        graphic: {
          $action: 'replace', // 关键：强制替换所有 graphic 元素，防止堆叠
          elements: text ? [{
            type: 'text',
            id: 'fly-in-text', // 使用固定 ID 配合 replace 动作
            z: 100,
            left: 'center',
            top: 120,
            silent: true,
            style: {
              text: text,
              textAlign: 'center',
              fill: topTextColor,
              font: `bold ${topTextFontSize}px 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', sans-serif`,
              opacity: 0,
              y: -20
            },
            keyframeAnimation: [{
              duration: 600,
              loop: false,
              keyframes: [{
                percent: 0,
                style: { opacity: 0, y: -20 }
              }, {
                percent: 1,
                style: { opacity: 1, y: 0 }
              }],
              easing: 'cubicOut'
            }]
          }] : []
        }
      };

      instance.setOption(chartOption, { 
        lazyUpdate: false,
        notMerge: false 
      });

      setCurrentStep(count)
    })
  }

  const renderData = (count: number) => renderDataTo(instanceRef.current, count)

  const resetMapTo = (instance: echarts.ECharts | null) => {
    setCurrentProvinceInfo({ name: '', value: 0, key: 0 })
    instance?.setOption({
      series: [{ data: [] }, { data: [] }, { data: [] }],
      graphic: []
    })
  }

  const resetMap = () => resetMapTo(instanceRef.current)

  const playAnimation = async () => {
    if (isPlaying || !instanceRef.current) return
    setIsPlaying(true)
    setStatusText('动画播放中')
    resetMap()
    for (let i = 1; i <= orderedEntries.length; i += 1) {
      await renderData(i)
      await sleep(stepDelay)
    }
    setStatusText('播放完成')
    setIsPlaying(false)
  }

  const ensureFfmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current
    const ffmpeg = new FFmpeg()
    const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm'

    const loadFrom = async (url: string) => {
      const coreURL = await toBlobURL(`${url}/ffmpeg-core.js`, 'text/javascript')
      const wasmURL = await toBlobURL(`${url}/ffmpeg-core.wasm`, 'application/wasm')
      await ffmpeg.load({ coreURL, wasmURL })
    }

    const loadWithTimeout = async (url: string, timeoutMs: number) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          loadFrom(url),
          new Promise<void>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('FFmpeg load timeout')), timeoutMs)
          })
        ])
      } finally {
        if (timeoutId) clearTimeout(timeoutId)
      }
    }

    setStatusText('正在下载转码核心组件 (约 30MB)...')

    try {
      await loadWithTimeout(baseURL, 45000)
    } catch (err) {
      const backupURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
      setStatusText('主地址加载失败，正在尝试备用地址...')
      await loadWithTimeout(backupURL, 45000)
    }

    ffmpegRef.current = ffmpeg
    return ffmpeg
  }

  const [exportProgress, setExportProgress] = useState(0)

  const downloadBlob = (blob: Blob, extension: 'mp4' | 'webm') => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `china-map-${new Date().getTime()}.${extension}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  const exportMp4 = async () => {
    if (isExporting || isPlaying || !instanceRef.current || !mapReady) return
    
    setIsExporting(true)
    setExportProgress(0)
    setStatusText('正在准备录制...')

    try {
      const fps = 30
      const canvas = instanceRef.current.getDom().querySelector('canvas')
      if (!canvas) {
        throw new Error('未找到录制画布')
      }
      
      const stream = canvas.captureStream(fps)
      const mp4MimeCandidates = [
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4;codecs=avc1.4D401E',
        'video/mp4;codecs=h264',
        'video/mp4'
      ]
      const supportedMp4Mime = mp4MimeCandidates.find((mime) => MediaRecorder.isTypeSupported(mime))
      const webmVp9Mime = 'video/webm;codecs=vp9'
      const webmMime = 'video/webm'
      const recorderMime = supportedMp4Mime || (MediaRecorder.isTypeSupported(webmVp9Mime) ? webmVp9Mime : webmMime)
      const recorder = new MediaRecorder(stream, { 
        mimeType: recorderMime,
        videoBitsPerSecond: 12000000
      })
      
      const chunks: Blob[] = []
      const dataPromise = new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data)
        }
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorderMime }))
        recorder.onerror = reject
      })

      recorder.start(1000)
      setStatusText('正在录制动画...')
      
      for (let i = 1; i <= orderedEntries.length; i += 1) {
        await renderDataTo(instanceRef.current, i)
        setExportProgress(Math.round((i / orderedEntries.length) * 95))
        // 等待动画完成，确保飞入动画被录制
        await sleep(Math.max(stepDelay, 800))
      }
      
      await sleep(1500)
      recorder.requestData()
      recorder.stop()
      
      const recordedBlob = await dataPromise
      if (recordedBlob.size === 0) {
        throw new Error('录制结果为空，无法导出')
      }

      if (recorderMime.startsWith('video/mp4')) {
        setStatusText('导出完成，准备下载...')
        setExportProgress(100)
        downloadBlob(recordedBlob, 'mp4')
        setStatusText('导出成功!')
        return
      }

      setStatusText('正在转码为 MP4...')
      setExportProgress(95)

      let ffmpeg: FFmpeg
      try {
        ffmpeg = await ensureFfmpeg()
      } catch (error) {
        setStatusText('转码引擎加载失败，已导出 WebM')
        downloadBlob(recordedBlob, 'webm')
        return
      }

      ffmpeg.on('progress', ({ progress }) => {
        const percent = 95 + Math.round(progress * 5)
        setExportProgress(percent)
      })

      await ffmpeg.writeFile('input.webm', await fetchFile(recordedBlob))
      try {
        await ffmpeg.exec([
          '-fflags', '+genpts',
          '-i', 'input.webm',
          '-r', '30',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          'output.mp4'
        ])
      } catch (error) {
        setStatusText('转码失败，已导出 WebM')
        downloadBlob(recordedBlob, 'webm')
        return
      }

      const data = await ffmpeg.readFile('output.mp4')
      const mp4Blob = new Blob([data as BlobPart], { type: 'video/mp4' })
      if (mp4Blob.size === 0) {
        setStatusText('转码输出为空，已导出 WebM')
        downloadBlob(recordedBlob, 'webm')
        return
      }
      setStatusText('导出完成，准备下载...')
      setExportProgress(100)
      downloadBlob(mp4Blob, 'mp4')
      setStatusText('导出成功!')
    } catch (error) {
      console.error('Export failed:', error)
      setStatusText('导出失败: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setIsExporting(false)
      setExportProgress(0)
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h1 className="title">中国省份数据动画地图</h1>
        <div className="panel">
          <label className="label">JSON 数据输入</label>
          <button 
            className="button secondary" 
            onClick={loadExampleData}
            style={{ marginBottom: '8px' }}
          >
            加载示例数据
          </button>
          <textarea
            className="textarea"
            value={jsonInput}
            onChange={(e) => handleJsonChange(e.target.value)}
            placeholder='请输入 JSON 格式数据，例如: {"福建": 3500, "浙江": 3100}'
          />
        </div>

        <div className="panel">
          <label className="label">地图标题</label>
          <input
            className="input"
            type="text"
            value={titleText}
            onChange={(event) => setTitleText(event.target.value)}
            placeholder="请输入地图标题"
          />
        </div>
        <div className="panel">
          <label className="label">标题字号</label>
          <input
            className="input"
            type="range"
            min={12}
            max={64}
            step={1}
            value={titleFontSize}
            onChange={(event) => setTitleFontSize(Number(event.target.value))}
          />
          <span style={{ color: '#fff', fontSize: '12px' }}>{titleFontSize}px</span>
        </div>
        <div className="panel">
          <label className="label">标题颜色</label>
          <input
            className="input"
            type="color"
            value={titleColor}
            onChange={(event) => setTitleColor(event.target.value)}
          />
        </div>
        <div className="panel">
          <label className="label">省份名称字号</label>
          <input
            className="input"
            type="range"
            min={1}
            max={30}
            step={1}
            value={provinceNameFontSize}
            onChange={(event) => setProvinceNameFontSize(Number(event.target.value))}
          />
          <span style={{ color: '#fff', fontSize: '12px' }}>{provinceNameFontSize}px</span>
        </div>
        <div className="panel">
          <label className="label">省份数值字号</label>
          <input
            className="input"
            type="range"
            min={1}
            max={30}
            step={1}
            value={labelFontSize}
            onChange={(event) => setLabelFontSize(Number(event.target.value))}
          />
          <span style={{ color: '#fff', fontSize: '12px' }}>{labelFontSize}px</span>
        </div>
        <div className="panel">
          <label className="label">地图缩放倍数</label>
          <input
            className="input"
            type="range"
            min={1}
            max={5}
            step={0.1}
            value={mapZoom}
            onChange={(event) => setMapZoom(Number(event.target.value))}
          />
          <span style={{ color: '#fff', fontSize: '12px' }}>{mapZoom.toFixed(1)}x</span>
        </div>
        <div className="panel">
          <label className="label">地图中心偏移 (X)</label>
          <input
            className="input"
            type="range"
            min={70}
            max={140}
            step={1}
            value={mapCenterX}
            onChange={(event) => setMapCenterX(Number(event.target.value))}
          />
          <span style={{ color: '#fff', fontSize: '12px' }}>{mapCenterX}°E</span>
        </div>
        <div className="panel">
          <label className="label">地图中心偏移 (Y)</label>
          <input
            className="input"
            type="range"
            min={15}
            max={55}
            step={1}
            value={mapCenterY}
            onChange={(event) => setMapCenterY(Number(event.target.value))}
          />
          <span style={{ color: '#fff', fontSize: '12px' }}>{mapCenterY}°N</span>
        </div>
        <div className="panel">
          <label className="label">数值气泡颜色</label>
          <input
            className="input"
            type="color"
            value={labelBgColor.startsWith('rgba') ? '#ff4d4f' : labelBgColor}
            onChange={(event) => setLabelBgColor(event.target.value)}
          />
        </div>
        <div className="panel">
          <label className="label">地图上方文字字号</label>
          <input
            className="input"
            type="range"
            min={20}
            max={80}
            step={1}
            value={topTextFontSize}
            onChange={(event) => setTopTextFontSize(Number(event.target.value))}
          />
          <span style={{ color: '#fff', fontSize: '12px' }}>{topTextFontSize}px</span>
        </div>
        <div className="panel">
          <label className="label">地图上方文字颜色</label>
          <input
            className="input"
            type="color"
            value={topTextColor}
            onChange={(event) => setTopTextColor(event.target.value)}
          />
        </div>
        <div className="panel">
          <label className="label">地图色条颜色（低 - 中 - 高）</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {visualMapColors.map((color, index) => (
              <input
                key={index}
                className="input"
                type="color"
                style={{ flex: 1, padding: '2px', height: '30px' }}
                value={color}
                onChange={(event) => {
                  const newColors = [...visualMapColors]
                  newColors[index] = event.target.value
                  setVisualMapColors(newColors)
                }}
              />
            ))}
          </div>
        </div>
        <div className="panel">
          <label className="label">排序方式</label>
          <select
            className="select"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as SortOrder)}
            disabled={isPlaying || isExporting}
          >
            <option value="desc">从大到小</option>
            <option value="asc">从小到大</option>
          </select>
        </div>
        <div className="panel">
          <label className="label">每步间隔 (ms)</label>
          <input
            className="input"
            type="number"
            min={100}
            max={5000}
            value={stepDelay}
            onChange={(event) => setStepDelay(Number(event.target.value))}
            disabled={isPlaying || isExporting}
          />
        </div>
        <div className="panel">
          <button className="button primary" onClick={playAnimation} disabled={isPlaying || isExporting}>
            播放动画
          </button>
          <button className="button" onClick={exportMp4} disabled={isPlaying || isExporting}>
            导出 MP4
          </button>
        </div>
        <div className="status">
          {statusText}
          {isExporting && (
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${exportProgress}%` }} />
            </div>
          )}
        </div>
        {currentStep > 0 && (
          <div className="current-info">
            <div className="label">当前省份</div>
            <div className="value">{orderedEntries[currentStep - 1][0]}</div>
            <div className="progress">进度: {currentStep} / {orderedEntries.length}</div>
          </div>
        )}
        <div className="panel data-list">
          {orderedEntries.map(([name, value]) => (
            <div key={name} className="data-row">
              <span>{name}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      </aside>
      <main className="map-panel">
          <div className="map-wrapper" id="capture-area">
            {/* 预览和导出都统一使用 ECharts Graphic 渲染，此处仅保留容器 */}
            <div ref={chartRef} className="map-canvas" />
          </div>
        </main>
    </div>
  )
}
