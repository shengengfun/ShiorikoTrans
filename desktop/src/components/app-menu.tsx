import { useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, MoreHorizontal, Settings2, Terminal } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'

interface AppMenuProps {
	onClickSettings: (scrollTo?: string) => void
}

export default function AppMenu({ onClickSettings }: AppMenuProps) {
	const navigate = useNavigate()
	const location = useLocation()
	const disableBack = Boolean((location.state as { disableBack?: boolean } | null)?.disableBack)
	const canGoBack = location.key !== 'default' && !disableBack
	const [open, setOpen] = useState(false)

	return (
		<div dir="ltr">
			<DropdownMenu open={open} onOpenChange={setOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="icon"
						className="group relative h-11 w-11 rounded-xl border-border/75 bg-card/92 shadow-xs transition-all hover:-translate-y-px hover:bg-card hover:shadow-sm"
						aria-label={m.moreOptions()}
					>
						<MoreHorizontal className="h-4.5 w-4.5 text-foreground/90 transition-colors group-hover:text-foreground" strokeWidth={2.35} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56 rounded-xl border-border/75 bg-popover/98 p-1.5 shadow-lg">
					<DropdownMenuItem onClick={() => onClickSettings()} className="h-10 rounded-md px-3 text-[15px] font-medium">
						<Settings2 className="h-4 w-4 text-muted-foreground" />
						{m.settings()}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => onClickSettings('api')} className="h-10 rounded-md px-3 text-[15px] font-medium">
						<Terminal className="h-4 w-4 text-muted-foreground" />
						{m.apiAndAgents()}
					</DropdownMenuItem>
					{canGoBack && (
						<DropdownMenuItem onClick={() => navigate(-1)} className="h-10 rounded-md px-3 text-[15px] font-medium">
							<ArrowLeft className="h-4 w-4 text-muted-foreground" />
							{m.back()}
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}
