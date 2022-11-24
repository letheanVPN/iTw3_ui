import {
  Component,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  UntypedFormControl,
  UntypedFormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { BackendService } from '../../../../../api/services/backend.service';
import { VariablesService } from '@parts/services/variables.service';
import { ModalService } from '@parts/services/modal.service';
import { Location } from '@angular/common';
import { IntToMoneyPipe } from '@parts/pipes/int-to-money.pipe';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { hasOwnProperty } from '@parts/functions/hasOwnProperty';

@Component({
  selector: 'app-purchase',
  templateUrl: './purchase.component.html',
  styleUrls: ['./purchase.component.scss'],
})
export class PurchaseComponent implements OnInit, OnDestroy {
  isOpen = false;

  localAliases = [];

  currentWalletId;

  newPurchase = false;

  actionData = null;

  historyBlock;

  sameAmountChecked = false;

  additionalOptions = false;

  currentContract = null;

  showTimeSelect = false;

  showNullify = false;

  purchaseForm = new UntypedFormGroup({
    description: new UntypedFormControl('', Validators.required),
    seller: new UntypedFormControl('', [
      Validators.required,
      (g: UntypedFormControl): ValidationErrors | null => {
        if (g.value === this.variablesService.currentWallet.address) {
          return { address_same: true };
        }
        return null;
      },
      (g: UntypedFormControl): ValidationErrors | null => {
        this.localAliases = [];
        if (g.value) {
          if (g.value.indexOf('@') !== 0) {
            this.isOpen = false;
            this.backend.validateAddress(g.value, valid_status => {
              this.ngZone.run(() => {
                if (valid_status === false) {
                  g.setErrors(
                    Object.assign({ address_not_valid: true }, g.errors)
                  );
                } else {
                  if (g.hasError('address_not_valid')) {
                    delete g.errors['address_not_valid'];
                    if (Object.keys(g.errors).length === 0) {
                      g.setErrors(null);
                    }
                  }
                }
              });
            });
            return g.hasError('address_not_valid')
              ? { address_not_valid: true }
              : null;
          } else {
            this.isOpen = true;
            this.localAliases = this.variablesService.aliases.filter(item => {
              return item.name.indexOf(g.value) > -1;
            });
            // eslint-disable-next-line
            if (!/^@?[a-z\d\-]{6,25}$/.test(g.value)) {
              g.setErrors(Object.assign({ alias_not_valid: true }, g.errors));
            } else {
              this.backend.getAliasByName(
                g.value.replace('@', ''),
                (alias_status, alias_data) => {
                  this.ngZone.run(() => {
                    if (alias_status) {
                      if (
                        alias_data.address ===
                        this.variablesService.currentWallet.address
                      ) {
                        g.setErrors(
                          Object.assign({ address_same: true }, g.errors)
                        );
                      }
                      if (g.hasError('alias_not_valid')) {
                        delete g.errors['alias_not_valid'];
                        if (Object.keys(g.errors).length === 0) {
                          g.setErrors(null);
                        }
                      }
                    } else {
                      g.setErrors(
                        Object.assign({ alias_not_valid: true }, g.errors)
                      );
                    }
                  });
                }
              );
            }
            return g.hasError('alias_not_valid')
              ? { alias_not_valid: true }
              : null;
          }
        }
        return null;
      },
    ]),
    amount: new UntypedFormControl(null, [
      Validators.required,
      (g: UntypedFormControl): ValidationErrors | null => {
        if (parseFloat(g.value) === 0) {
          return { amount_zero: true };
        }
        return null;
      },
    ]),
    yourDeposit: new UntypedFormControl(null, Validators.required),
    sellerDeposit: new UntypedFormControl(null, Validators.required),
    sameAmount: new UntypedFormControl({ value: false, disabled: false }),
    comment: new UntypedFormControl(''),
    fee: new UntypedFormControl(this.variablesService.default_fee),
    time: new UntypedFormControl({ value: 12, disabled: false }),
    timeCancel: new UntypedFormControl({ value: 12, disabled: false }),
    payment: new UntypedFormControl(''),
    password: new UntypedFormControl(''),
  });

  private destroy$ = new Subject<void>();

  constructor(
    public variablesService: VariablesService,
    private route: ActivatedRoute,
    private backend: BackendService,
    private modalService: ModalService,
    private ngZone: NgZone,
    private location: Location,
    private intToMoneyPipe: IntToMoneyPipe
  ) {}

  @HostListener('document:click', ['$event.target'])
  onClick(targetElement): void {
    if (targetElement.id !== 'purchase-seller' && this.isOpen) {
      this.isOpen = false;
    }
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (hasOwnProperty(params, 'id')) {
        this.currentContract = this.variablesService.currentWallet.getContract(
          params['id']
        );
        this.purchaseForm.controls['seller'].setValidators([]);
        this.purchaseForm.updateValueAndValidity();
        this.purchaseForm.setValue({
          description: this.currentContract.private_detailes.t,
          seller: this.currentContract.private_detailes.b_addr,
          amount: this.intToMoneyPipe.transform(
            this.currentContract.private_detailes.to_pay
          ),
          yourDeposit: this.intToMoneyPipe.transform(
            this.currentContract.private_detailes.a_pledge
          ),
          sellerDeposit: this.intToMoneyPipe.transform(
            this.currentContract.private_detailes.b_pledge
          ),
          sameAmount: this.currentContract.private_detailes.to_pay.isEqualTo(
            this.currentContract.private_detailes.b_pledge
          ),
          comment: this.currentContract.private_detailes.c,
          fee: this.variablesService.default_fee,
          time: 12,
          timeCancel: 12,
          payment: this.currentContract.payment_id,
          password: this.variablesService.appPass,
        });
        this.purchaseForm.get('sameAmount').disable();
        this.newPurchase = false;

        if (this.currentContract.is_new) {
          if (this.currentContract.is_a && this.currentContract.state === 2) {
            this.currentContract.state = 120;
          }
          if (
            this.currentContract.state === 130 &&
            this.currentContract.cancel_expiration_time !== 0 &&
            this.currentContract.cancel_expiration_time <
              this.variablesService.exp_med_ts
          ) {
            this.currentContract.state = 2;
          }
          this.variablesService.settings.viewedContracts = this.variablesService
            .settings.viewedContracts
            ? this.variablesService.settings.viewedContracts
            : [];
          let findViewedCont = false;
          for (
            let j = 0;
            j < this.variablesService.settings.viewedContracts.length;
            j++
          ) {
            if (
              this.variablesService.settings.viewedContracts[j].contract_id ===
                this.currentContract.contract_id &&
              this.variablesService.settings.viewedContracts[j].is_a ===
                this.currentContract.is_a
            ) {
              this.variablesService.settings.viewedContracts[j].state =
                this.currentContract.state;
              findViewedCont = true;
              break;
            }
          }
          if (!findViewedCont) {
            this.variablesService.settings.viewedContracts.push({
              contract_id: this.currentContract.contract_id,
              is_a: this.currentContract.is_a,
              state: this.currentContract.state,
            });
          }
          this.currentContract.is_new = false;
          setTimeout(() => {
            this.variablesService.currentWallet.recountNewContracts();
          }, 0);
        }
        this.checkAndChangeHistory();
      } else {
        this.newPurchase = true;
      }
    });

    this.variablesService.getHeightAppEvent
      .pipe(takeUntil(this.destroy$))
      .subscribe((newHeight: number) => {
        if (
          this.currentContract &&
          this.currentContract.state === 201 &&
          this.currentContract.height !== 0 &&
          newHeight - this.currentContract.height >= 10
        ) {
          this.currentContract.state = 2;
          this.currentContract.is_new = true;
          this.variablesService.currentWallet.recountNewContracts();
        } else if (
          this.currentContract &&
          this.currentContract.state === 601 &&
          this.currentContract.height !== 0 &&
          newHeight - this.currentContract.height >= 10
        ) {
          this.currentContract.state = 6;
          this.currentContract.is_new = true;
          this.variablesService.currentWallet.recountNewContracts();
        }
      });

    if (this.variablesService.appPass) {
      this.purchaseForm.controls.password.setValidators([
        Validators.required,
        (g: UntypedFormControl): ValidationErrors | null => {
          if (g.value) {
            this.backend.checkMasterPassword({ pass: g.value }, status => {
              this.ngZone.run(() => {
                if (status === false) {
                  g.setErrors(
                    Object.assign({ password_not_match: true }, g.errors)
                  );
                } else {
                  if (g.hasError('password_not_match')) {
                    delete g.errors['password_not_match'];
                    if (Object.keys(g.errors).length === 0) {
                      g.setErrors(null);
                    }
                  }
                }
              });
            });
            return g.hasError('password_not_match')
              ? { password_not_match: true }
              : null;
          }
          return null;
        },
      ]);
    }
    this.variablesService.sendActionData$
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        if (res.action === 'escrow') {
          this.actionData = res;
          this.fillDeepLinkData();
          this.variablesService.sendActionData$.next({});
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  checkAndChangeHistory(): void {
    if (this.currentContract.state === 201) {
      this.historyBlock = this.variablesService.currentWallet.history.find(
        item =>
          item.tx_type === 8 &&
          item.contract[0].contract_id === this.currentContract.contract_id &&
          item.contract[0].is_a === this.currentContract.is_a
      );
    } else if (this.currentContract.state === 601) {
      this.historyBlock = this.variablesService.currentWallet.history.find(
        item =>
          item.tx_type === 12 &&
          item.contract[0].contract_id === this.currentContract.contract_id &&
          item.contract[0].is_a === this.currentContract.is_a
      );
    }
  }

  addressMouseDown(e): void {
    if (
      e['button'] === 0 &&
      this.purchaseForm.get('seller').value &&
      this.purchaseForm.get('seller').value.indexOf('@') === 0
    ) {
      this.isOpen = true;
    }
  }

  setAlias(alias): void {
    this.purchaseForm.get('seller').setValue(alias);
  }

  fillDeepLinkData(): void {
    this.additionalOptions = true;
    this.purchaseForm
      .get('description')
      .setValue(this.actionData.description || '');
    this.purchaseForm
      .get('seller')
      .setValue(this.actionData.seller_address || '');
    this.purchaseForm.get('amount').setValue(this.actionData.amount || '');
    this.purchaseForm
      .get('yourDeposit')
      .setValue(this.actionData.my_deposit || '');
    this.purchaseForm
      .get('sellerDeposit')
      .setValue(this.actionData.seller_deposit || '');
    this.purchaseForm
      .get('comment')
      .setValue(this.actionData.comment || this.actionData.comments || '');
  }

  toggleOptions(): void {
    this.additionalOptions = !this.additionalOptions;
  }

  getProgressBarWidth(): string {
    let progress = '0';
    if (!this.newPurchase) {
      if (this.currentContract) {
        if (this.currentContract.state === 1) {
          progress = '10%';
        }
        if (this.currentContract.state === 201) {
          progress = '25%';
        }
        if ([120, 2].indexOf(this.currentContract.state) !== -1) {
          progress = '50%';
        }
        if ([5, 601].indexOf(this.currentContract.state) !== -1) {
          progress = '75%';
        }
        if (
          [110, 130, 140, 3, 4, 6].indexOf(this.currentContract.state) !== -1
        ) {
          progress = '100%';
        }
      }
    }
    return progress;
  }

  sameAmountChange(): void {
    if (!this.sameAmountChecked) {
      this.purchaseForm.get('sellerDeposit').clearValidators();
      this.purchaseForm.get('sellerDeposit').updateValueAndValidity();
      this.sameAmountChecked = !this.sameAmountChecked;
    } else {
      this.purchaseForm
        .get('sellerDeposit')
        .setValidators([Validators.required]);
      this.purchaseForm.get('sellerDeposit').updateValueAndValidity();
      this.sameAmountChecked = !this.sameAmountChecked;
    }
  }

  createPurchase(): void {
    if (this.purchaseForm.valid) {
      const {
        amount,
        comment,
        description,
        payment,
        sameAmount,
        seller,
        sellerDeposit,
        time,
        yourDeposit,
      } = this.purchaseForm.value;

      const { wallet_id, address } = this.variablesService.currentWallet;

      const b_pledge = sameAmount ? amount : sellerDeposit;

      const callback = (create_status): void => {
        if (create_status) {
          this.back();
        }
      };

      if (seller.indexOf('@') !== 0) {
        this.backend.createProposal(
          wallet_id,
          description,
          comment,
          address,
          seller,
          amount,
          yourDeposit,
          b_pledge,
          time,
          payment,
          callback
        );
      } else {
        this.backend.getAliasByName(
          seller.replace('@', ''),
          (alias_status, alias_data) => {
            this.ngZone.run(() => {
              if (!alias_status) {
                this.ngZone.run(() => {
                  this.purchaseForm
                    .get('seller')
                    .setErrors({ alias_not_valid: true });
                });
              } else {
                this.backend.createProposal(
                  wallet_id,
                  description,
                  comment,
                  address,
                  alias_data.address,
                  amount,
                  yourDeposit,
                  b_pledge,
                  time,
                  payment,
                  callback
                );
              }
            });
          }
        );
      }
    }
  }

  back(): void {
    this.location.back();
  }

  acceptState(): void {
    this.backend.acceptProposal(
      this.variablesService.currentWallet.wallet_id,
      this.currentContract.contract_id,
      accept_status => {
        if (accept_status) {
          this.modalService.prepareModal(
            'info',
            'PURCHASE.ACCEPT_STATE_WAIT_BIG'
          );
          this.back();
        }
      }
    );
  }

  ignoredContract(): void {
    this.variablesService.settings.notViewedContracts = this.variablesService
      .settings.notViewedContracts
      ? this.variablesService.settings.notViewedContracts
      : [];
    let findViewedCont = false;
    for (
      let j = 0;
      j < this.variablesService.settings.notViewedContracts.length;
      j++
    ) {
      if (
        this.variablesService.settings.notViewedContracts[j].contract_id ===
          this.currentContract.contract_id &&
        this.variablesService.settings.notViewedContracts[j].is_a ===
          this.currentContract.is_a
      ) {
        this.variablesService.settings.notViewedContracts[j].state = 110;
        this.variablesService.settings.notViewedContracts[j].time =
          this.currentContract.expiration_time;
        findViewedCont = true;
        break;
      }
    }
    if (!findViewedCont) {
      this.variablesService.settings.notViewedContracts.push({
        contract_id: this.currentContract.contract_id,
        is_a: this.currentContract.is_a,
        state: 110,
        time: this.currentContract.expiration_time,
      });
    }
    this.currentContract.is_new = true;
    this.currentContract.state = 110;
    this.currentContract.time = this.currentContract.expiration_time;

    this.variablesService.currentWallet.recountNewContracts();
    this.modalService.prepareModal('info', 'PURCHASE.IGNORED_ACCEPT');
    this.back();
  }

  productNotGot(): void {
    this.backend.releaseProposal(
      this.variablesService.currentWallet.wallet_id,
      this.currentContract.contract_id,
      'REL_B',
      release_status => {
        if (release_status) {
          this.modalService.prepareModal('info', 'PURCHASE.BURN_PROPOSAL');
          this.back();
        }
      }
    );
  }

  dealsDetailsFinish(): void {
    this.backend.releaseProposal(
      this.variablesService.currentWallet.wallet_id,
      this.currentContract.contract_id,
      'REL_N',
      release_status => {
        if (release_status) {
          this.modalService.prepareModal(
            'success',
            'PURCHASE.SUCCESS_FINISH_PROPOSAL'
          );
          this.back();
        }
      }
    );
  }

  dealsDetailsCancel(): void {
    this.backend.requestCancelContract(
      this.variablesService.currentWallet.wallet_id,
      this.currentContract.contract_id,
      this.purchaseForm.get('timeCancel').value,
      cancel_status => {
        if (cancel_status) {
          this.modalService.prepareModal(
            'info',
            'PURCHASE.SEND_CANCEL_PROPOSAL'
          );
          this.back();
        }
      }
    );
  }

  dealsDetailsDontCanceling(): void {
    this.variablesService.settings.notViewedContracts = this.variablesService
      .settings.notViewedContracts
      ? this.variablesService.settings.notViewedContracts
      : [];
    let findViewedCont = false;
    for (
      let j = 0;
      j < this.variablesService.settings.notViewedContracts.length;
      j++
    ) {
      if (
        this.variablesService.settings.notViewedContracts[j].contract_id ===
          this.currentContract.contract_id &&
        this.variablesService.settings.notViewedContracts[j].is_a ===
          this.currentContract.is_a
      ) {
        this.variablesService.settings.notViewedContracts[j].state = 130;
        this.variablesService.settings.notViewedContracts[j].time =
          this.currentContract.cancel_expiration_time;
        findViewedCont = true;
        break;
      }
    }
    if (!findViewedCont) {
      this.variablesService.settings.notViewedContracts.push({
        contract_id: this.currentContract.contract_id,
        is_a: this.currentContract.is_a,
        state: 130,
        time: this.currentContract.cancel_expiration_time,
      });
    }
    this.currentContract.is_new = true;
    this.currentContract.state = 130;
    this.currentContract.time = this.currentContract.cancel_expiration_time;
    this.variablesService.currentWallet.recountNewContracts();
    this.modalService.prepareModal('info', 'PURCHASE.IGNORED_CANCEL');
    this.back();
  }

  dealsDetailsSellerCancel(): void {
    this.backend.acceptCancelContract(
      this.variablesService.currentWallet.wallet_id,
      this.currentContract.contract_id,
      accept_status => {
        if (accept_status) {
          this.modalService.prepareModal(
            'info',
            'PURCHASE.DEALS_CANCELED_WAIT'
          );
          this.back();
        }
      }
    );
  }
}
