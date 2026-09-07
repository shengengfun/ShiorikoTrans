import { useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { InfoTooltip } from '~/components/info-tooltip'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'

import { SectionCard, type SettingsViewModel } from './shared'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'

export function GpuSection({ vm }: { vm: SettingsViewModel }) {
	const [detecting, setDetecting] = useState(false)
	const [vulkanInfo, setVulkanInfo] = useState<string | null>(null)

	async function detectGpu() {
		setDetecting(true)
		try {
			const devices = await invoke<Array<{ index: number; name: string; description: string; type: string }>>('get_gpu_devices')
			vm.setGpuDevices(devices as any)
			if (devices.length === 0) {
				toast.warning('未检测到 GPU 设备')
			} else {
				toast.success(`检测到 ${devices.length} 个 GPU 设备`)
			}
		} catch (error) {
			console.error(error)
			toast.error('GPU 设备检测失败')
		} finally {
			setDetecting(false)
		}
	}

	async function checkVulkan() {
		try {
			const devices = await invoke<Array<{ index: number; name: string; description: string; type: string }>>('get_gpu_devices')
			const info = devices.map((d) => `${d.index}: ${d.name} (${d.type})`).join('\n')
			setVulkanInfo(info || '未找到支持 Vulkan 的设备')
		} catch (error) {
			setVulkanInfo('无法获取 Vulkan 信息')
		}
	}

	return (
		<div className="space-y-5">
			<div className="space-y-2">
				<span className="px-1 text-sm font-semibold text-foreground/95">{m.hardwareAcceleration()}</span>
				<SectionCard>
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<span className="flex items-center gap-1 text-sm font-medium">
								<InfoTooltip text="强制使用 CPU 模式，完全禁用 GPU 加速" />
								强制 CPU 模式
							</span>
							<Switch
								checked={vm.preference.forceCpu}
								onCheckedChange={vm.preference.setForceCpu}
							/>
						</div>

						<div className="space-y-2">
							<InfoTooltip text="手动指定 Vulkan 设备索引，用于精细 GPU 选择" />
							<Input
								type="number"
								value={vm.preference.vulkanDevice ?? ''}
								onChange={(e) => {
									const val = e.target.value
									vm.preference.setVulkanDevice(val === '' ? null : parseInt(val, 10))
								}}
								placeholder="Vulkan 设备索引（留空为自动）"
							/>
						</div>

						<div className="space-y-2">
							<InfoTooltip text="启用详细 GPU 诊断信息，用于故障排查" />
							<Input
								type="text"
								value={vm.preference.modelQuantization}
								onChange={(e) => vm.preference.setModelQuantization(e.target.value)}
								placeholder="模型量化提示（如 Q4_K_M, F16）"
							/>
						</div>

						<div className="flex items-center justify-between">
							<span className="flex items-center gap-1 text-sm font-medium">
								<InfoTooltip text="启用 GPU 操作的详细诊断日志" />
								启用诊断
							</span>
							<Switch
								checked={vm.preference.enableDiagnostics}
								onCheckedChange={vm.preference.setEnableDiagnostics}
							/>
						</div>

						<Button
							variant="secondary"
							onClick={detectGpu}
							disabled={detecting}
							className="w-full">
							{detecting ? '检测中...' : '检测 GPU 设备'}
						</Button>
					</div>
				</SectionCard>
			</div>

			<div className="space-y-2">
				<span className="px-1 text-sm font-semibold text-foreground/95">Vulkan 诊断</span>
				<SectionCard>
					<div className="space-y-4">
						<Button variant="secondary" onClick={checkVulkan} className="w-full">
							查看 Vulkan 信息
						</Button>
						{vulkanInfo && (
							<pre className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{vulkanInfo}</pre>
						)}
					</div>
				</SectionCard>
			</div>
		</div>
	)
}