import { ButtonLink, Empty } from '../components/ui'
export default function NotFound() {
  return <div className="mx-auto max-w-3xl px-4 py-20"><Empty title="Page not found" action={<ButtonLink to="/" variant="primary">Back to home</ButtonLink>}>That address doesn't exist.</Empty></div>
}
