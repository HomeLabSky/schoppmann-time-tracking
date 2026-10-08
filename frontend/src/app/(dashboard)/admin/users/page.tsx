'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Ban, CheckCircle2, LogOut, MoreHorizontal, Pencil, Trash2, UserPlus, Wallet } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useDeleteUser, useRevokeUserSessions, useToggleUserStatus, useUsers } from '@/lib/queries'
import { csvNumber } from '@/lib/csv'
import { formatCurrency, formatDate, getErrorMessage, getInitials } from '@/lib/utils'
import { ROLE_LABELS } from '@/schemas'
import type { User } from '@/types/api'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { BillingSettingsDialog, CreateUserDialog, EditUserDialog } from '@/components/features/users/user-dialogs'

type RoleFilter = 'all' | User['role']
type StatusFilter = 'all' | 'active' | 'inactive'

export default function UsersPage() {
  const { user: me } = useAuth()
  const users = useUsers()
  const toggle = useToggleUserStatus()
  const remove = useDeleteUser()
  const revokeUserSessions = useRevokeUserSessions()
  const [confirm, confirmDialog] = useConfirm()

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [billing, setBilling] = useState<User | null>(null)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const data = useMemo(
    () =>
      (users.data ?? []).filter(
        (u) =>
          (roleFilter === 'all' || u.role === roleFilter) &&
          (statusFilter === 'all' || (statusFilter === 'active' ? u.isActive : !u.isActive))
      ),
    [users.data, roleFilter, statusFilter]
  )

  const { mutate: toggleStatus } = toggle
  const { mutate: deleteUser } = remove
  const { mutate: revokeSessions } = revokeUserSessions

  const columns = useMemo<ColumnDef<User, unknown>[]>(() => {
    const askToggle = async (u: User) => {
      const deactivate = u.isActive
      const ok = await confirm({
        title: deactivate ? `${u.name} deaktivieren?` : `${u.name} aktivieren?`,
        message: deactivate
          ? 'Der Benutzer wird sofort abgemeldet und kann sich nicht mehr anmelden. Zeiteinträge bleiben erhalten.'
          : 'Der Benutzer kann sich wieder anmelden.',
        confirmLabel: deactivate ? 'Deaktivieren' : 'Aktivieren',
        destructive: deactivate,
      })
      if (ok) toggleStatus(u.id)
    }
    const askRevokeSessions = async (u: User) => {
      const ok = await confirm({
        title: `${u.name} überall abmelden?`,
        message:
          'Alle Sitzungen in Browsern und Apps werden sofort beendet, z. B. nach Verlust eines Geräts. Das Konto bleibt aktiv; eine neue Anmeldung ist möglich.',
        confirmLabel: 'Überall abmelden',
        destructive: true,
      })
      if (ok) revokeSessions(u.id)
    }
    const askDelete = async (u: User) => {
      const ok = await confirm({
        title: `${u.name} endgültig löschen?`,
        message:
          'Nur möglich, solange keine Zeiteinträge oder Abschlüsse existieren – sonst bitte deaktivieren. Der Vorgang wird protokolliert.',
        confirmLabel: 'Löschen',
        destructive: true,
      })
      if (ok) deleteUser(u.id)
    }

    return [
      {
        id: 'name',
        accessorFn: (u) => u.name,
        header: 'Benutzer',
        cell: ({ row }) => {
          const u = row.original
          return (
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {getInitials(u.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {u.name}
                  {u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(Sie)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
            </div>
          )
        },
      },
      {
        id: 'role',
        accessorFn: (u) => ROLE_LABELS[u.role],
        header: 'Rolle',
        cell: ({ row }) => <Badge variant={row.original.role === 'admin' ? 'info' : 'neutral'}>{ROLE_LABELS[row.original.role]}</Badge>,
      },
      {
        id: 'rate',
        accessorFn: (u) => Number(u.stundenlohn ?? 0),
        header: 'Stundenlohn',
        meta: { className: 'text-right' },
        cell: ({ row }) =>
          row.original.role === 'mitarbeiter' ? (
            <span className="tabular">{formatCurrency(Number(row.original.stundenlohn ?? 0))}</span>
          ) : (
            <span className="text-muted-foreground">–</span>
          ),
      },
      {
        id: 'period',
        accessorFn: (u) => `${u.abrechnungStart ?? 1}.–${u.abrechnungEnde ?? 31}.`,
        header: 'Abrechnung',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.role === 'mitarbeiter' ? (
            <span className="tabular text-muted-foreground">
              {row.original.abrechnungStart ?? 1}. – {row.original.abrechnungEnde ?? 31}.
              {row.original.nacherfassungAb && (
                <Badge variant="info" className="ml-2" title="Nacherfassung freigegeben">
                  Nacherfassung ab {formatDate(row.original.nacherfassungAb)}
                </Badge>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">–</span>
          ),
      },
      {
        id: 'status',
        accessorFn: (u) => (u.isActive ? 'Aktiv' : 'Deaktiviert'),
        header: 'Status',
        cell: ({ row }) =>
          row.original.isActive ? <Badge variant="success">Aktiv</Badge> : <Badge variant="danger">Deaktiviert</Badge>,
      },
      {
        id: 'createdAt',
        accessorFn: (u) => u.createdAt ?? '',
        header: 'Angelegt',
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {row.original.createdAt ? formatDate(row.original.createdAt.slice(0, 10)) : '–'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aktionen</span>,
        enableSorting: false,
        meta: { className: 'w-12 text-right' },
        cell: ({ row }) => {
          const u = row.original
          const isSelf = u.id === me?.id
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Aktionen für ${u.name}`}>
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(u)}>
                  <Pencil aria-hidden="true" /> Bearbeiten
                </DropdownMenuItem>
                {u.role === 'mitarbeiter' && (
                  <DropdownMenuItem onSelect={() => setBilling(u)}>
                    <Wallet aria-hidden="true" /> Abrechnungsdaten
                  </DropdownMenuItem>
                )}
                {!isSelf && (
                  <>
                    <DropdownMenuSeparator />
                    {u.isActive && (
                      <DropdownMenuItem onSelect={() => askRevokeSessions(u)}>
                        <LogOut aria-hidden="true" /> Überall abmelden
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => askToggle(u)} destructive={u.isActive}>
                      {u.isActive ? <Ban aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                      {u.isActive ? 'Deaktivieren' : 'Aktivieren'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => askDelete(u)} destructive>
                      <Trash2 aria-hidden="true" /> Löschen
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ]
  }, [me?.id, confirm, toggleStatus, deleteUser, revokeSessions])

  const counts = useMemo(() => {
    const list = users.data ?? []
    return {
      employees: list.filter((u) => u.role === 'mitarbeiter' && u.isActive).length,
      inactive: list.filter((u) => !u.isActive).length,
    }
  }, [users.data])

  return (
    <>
      <PageHeader
        title="Benutzer"
        description={
          users.data ? `${counts.employees} aktive Mitarbeiter · ${counts.inactive} deaktiviert` : 'Konten, Rollen und Abrechnungsdaten'
        }
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus aria-hidden="true" />
            Benutzer anlegen
          </Button>
        }
      />

      {users.isError && (
        <Alert variant="danger" title="Benutzer konnten nicht geladen werden" className="mb-4">
          {getErrorMessage(users.error)}
        </Alert>
      )}

      <DataTable
        caption="Benutzerkonten"
        columns={columns}
        data={data}
        loading={users.isLoading}
        getRowId={(u) => String(u.id)}
        initialSorting={[{ id: 'name', desc: false }]}
        searchPlaceholder="Name oder E-Mail suchen…"
        searchText={(u) => `${u.name} ${u.email}`}
        rowClassName={(u) => (u.isActive ? undefined : 'opacity-60')}
        empty={{
          title: 'Keine Benutzer',
          description: 'Mit den gewählten Filtern gibt es keine Konten.',
        }}
        toolbar={
          <>
            <Select
              aria-label="Nach Rolle filtern"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
              className="w-auto"
            >
              <option value="all">Alle Rollen</option>
              <option value="mitarbeiter">Mitarbeiter</option>
              <option value="admin">Administratoren</option>
            </Select>
            <Select
              aria-label="Nach Status filtern"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-auto"
            >
              <option value="all">Alle Status</option>
              <option value="active">Aktiv</option>
              <option value="inactive">Deaktiviert</option>
            </Select>
          </>
        }
        csv={{
          filename: 'benutzer',
          columns: [
            { header: 'Name', value: (u) => u.name },
            { header: 'E-Mail', value: (u) => u.email },
            { header: 'Rolle', value: (u) => ROLE_LABELS[u.role] },
            { header: 'Status', value: (u) => (u.isActive ? 'Aktiv' : 'Deaktiviert') },
            { header: 'Stundenlohn (€)', value: (u) => (u.role === 'mitarbeiter' ? csvNumber(Number(u.stundenlohn ?? 0)) : '') },
            { header: 'Abrechnung von', value: (u) => u.abrechnungStart ?? '' },
            { header: 'Abrechnung bis', value: (u) => u.abrechnungEnde ?? '' },
            { header: 'Lohnzettel-E-Mail', value: (u) => u.lohnzettelEmail ?? '' },
          ],
        }}
      />

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditUserDialog user={editing} onClose={() => setEditing(null)} isSelf={editing?.id === me?.id} />
      <BillingSettingsDialog user={billing} onClose={() => setBilling(null)} />
      {confirmDialog}
    </>
  )
}
