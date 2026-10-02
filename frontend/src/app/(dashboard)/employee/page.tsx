import { redirect } from 'next/navigation'

// Die Zeiterfassung liegt unter /employee/dashboard. Diese Route leitet nur weiter
// (die frühere Willkommensseite enthielt Testcode und Typfehler).
export default function EmployeePage() {
  redirect('/employee/dashboard')
}
