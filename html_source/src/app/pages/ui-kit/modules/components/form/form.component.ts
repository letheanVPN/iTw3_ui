import { Component } from '@angular/core';

@Component({
  selector: 'app-form',
  template: `
    <div class="mb-2">
      <h2 class="mb-1">Inputs</h2>
      <app-inputs></app-inputs>
    </div>

    <div class="mb-2">
      <h2 class="mb-1">Selects</h2>
      <app-selects></app-selects>
    </div>

    <div class="mb-2">
      <h2 class="mb-1">Checkbox</h2>
      <app-checkboxs></app-checkboxs>
    </div>

    <div class="mb-2">
      <h2 class="mb-1">Switches</h2>
      <app-switches></app-switches>
    </div>
  `,
  styles: [],
})
export class FormComponent {}
