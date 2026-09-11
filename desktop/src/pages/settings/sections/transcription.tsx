import LanguageInput from '~/components/language-input'
import { SectionCard } from './shared'

export function TranscriptionSection() {
	return (
		<div className="space-y-5">
			<SectionCard>
				<LanguageInput />
			</SectionCard>
		</div>
	)
}
