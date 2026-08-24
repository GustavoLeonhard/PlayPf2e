import type { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'characters' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'characters',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/character-list/character-list.component').then((m) => m.CharacterListComponent),
  },
  {
    path: 'characters/new',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/wizard/wizard.component').then((m) => m.WizardComponent),
  },
  {
    path: 'characters/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/sheet/sheet.component').then((m) => m.SheetComponent),
  },
  {
    path: 'characters/:id/level-up',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/level-up/level-up.component').then((m) => m.LevelUpComponent),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/profile/profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: 'parties',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/party-list/party-list.component').then((m) => m.PartyListComponent),
  },
  {
    // Una nota sacada afuera. Va antes que la genérica porque tiene un
    // segmento más y Angular resuelve por orden.
    path: 'parties/:id/ventana/nota/:notaId',
    canActivate: [authGuard],
    // El tipo no sale de la URL acá —el segmento lo ocupa el id— así que se
    // pasa por `data`, que el binding de inputs también resuelve.
    data: { tipo: 'nota' },
    loadComponent: () => import('./pages/mesa/ventana-suelta.component').then((m) => m.VentanaSueltaComponent),
  },
  {
    // La cara de un jugador, sacada afuera. Mismo motivo que la nota: el
    // segmento extra la tiene que resolver antes que la genérica.
    path: 'parties/:id/ventana/jugador/:userId',
    canActivate: [authGuard],
    data: { tipo: 'jugador' },
    loadComponent: () => import('./pages/mesa/ventana-suelta.component').then((m) => m.VentanaSueltaComponent),
  },
  {
    // Una ventana sacada afuera. Es la misma que vive en el lienzo, sola.
    path: 'parties/:id/ventana/:tipo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/mesa/ventana-suelta.component').then((m) => m.VentanaSueltaComponent),
  },
  {
    // La mesa: donde se juega. Va antes de 'parties/:id' no por precedencia
    // —Angular ya distingue— sino para que se lean juntas.
    path: 'parties/:id/mesa',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/mesa/mesa.component').then((m) => m.MesaComponent),
  },
  {
    path: 'parties/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/party/party.component').then((m) => m.PartyComponent),
  },
  /*
   * Sin guard a propósito: el link de invitación se abre sin sesión, y el propio
   * componente guarda el token y manda a iniciar sesión.
   */
  {
    path: 'join/:token',
    loadComponent: () => import('./pages/join/join.component').then((m) => m.JoinComponent),
  },
  { path: '**', redirectTo: 'characters' },
];
