import {
  AfterViewChecked,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { VariablesService } from '@parts/services/variables.service';
import { ActivatedRoute } from '@angular/router';
import { Transaction } from '@api/models/transaction.model';
import BigNumber from 'bignumber.js';
import { PaginationService } from '@store/pagination/pagination.service';
import { PaginationStore } from '@store/pagination/pagination.store';
import { Wallet } from '@api/models/wallet.model';
import { BackendService } from '@api/services/backend.service';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { hasOwnProperty } from '@parts/functions/hasOwnProperty';

@Component({
  selector: 'app-history',
  templateUrl: './history.component.html',
  styleUrls: ['./history.component.scss'],
})
export class HistoryComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('head', { static: true }) head: ElementRef;

  parentRouting;

  openedDetails = '';

  calculatedWidth = [];

  stop_paginate = false;

  mining = false;

  wallet: Wallet;

  x = new BigNumber(3);

  y = new BigNumber(0.2);

  private destroy$: Subject<void> = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    public variablesService: VariablesService,
    private pagination: PaginationService,
    private backend: BackendService,
    private ngZone: NgZone,
    private paginationStore: PaginationStore
  ) {}

  ngOnInit(): void {
    this.parentRouting = this.route.parent.params.subscribe(() => {
      this.openedDetails = '';
    });
    let restore = false;
    if (
      hasOwnProperty(
        this.variablesService.after_sync_request,
        String(this.variablesService.currentWallet.wallet_id)
      )
    ) {
      restore =
        this.variablesService.after_sync_request[
          this.variablesService.currentWallet.wallet_id
        ];
    }
    if (
      !this.variablesService.sync_started &&
      restore &&
      this.variablesService.currentWallet.wallet_id
    ) {
      this.wallet = this.variablesService.getNotLoadedWallet();
      if (this.wallet) {
        this.tick();
      }
      // if this is was restore wallet and it was selected on moment when sync completed
      this.getRecentTransfers();
      this.variablesService.after_sync_request[
        this.variablesService.currentWallet.wallet_id
      ] = false;
    }
    let after_sync_request = false;
    if (
      hasOwnProperty(
        this.variablesService.after_sync_request,
        String(this.variablesService.currentWallet.wallet_id)
      )
    ) {
      after_sync_request =
        this.variablesService.after_sync_request[
          this.variablesService.currentWallet.wallet_id
        ];
    }
    if (after_sync_request && !this.variablesService.sync_started) {
      // if user click on the wallet at the first time after restore.
      this.getRecentTransfers();
    }

    if (
      hasOwnProperty(
        this.variablesService.stop_paginate,
        String(this.variablesService.currentWallet.wallet_id)
      )
    ) {
      this.stop_paginate =
        this.variablesService.stop_paginate[
          this.variablesService.currentWallet.wallet_id
        ];
    } else {
      this.stop_paginate = false;
    }
    // this will hide pagination a bit earlier
    this.wallet = this.variablesService.getNotLoadedWallet();
    if (this.wallet) {
      this.tick();
    }

    this.variablesService.getWalletChangedEvent
      .pipe(
        filter(w => !!w),
        takeUntil(this.destroy$)
      )
      .subscribe((currentWallet: Wallet) => {
        this.mining = currentWallet.exclude_mining_txs;
      });
  }

  ngAfterViewChecked(): void {
    this.calculateWidth();
  }

  ngOnDestroy(): void {
    this.parentRouting.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  strokeSize(item): number {
    const rem = this.variablesService.settings.scale;
    if (
      (this.variablesService.height_app - item.height >= 10 &&
        item.height !== 0) ||
      (item.is_mining === true && item.height === 0)
    ) {
      return 0;
    } else {
      if (
        item.height === 0 ||
        this.variablesService.height_app - item.height < 0
      ) {
        return 4.5 * parseInt(rem, 10);
      } else {
        return (
          4.5 * parseInt(rem, 10) -
          ((4.5 * parseInt(rem, 10)) / 100) *
            ((this.variablesService.height_app - item.height) * 10)
        );
      }
    }
  }

  resetPaginationValues(): void {
    this.ngZone.run(() => {
      const total_history_item =
        this.variablesService.currentWallet.total_history_item;
      const count = this.variablesService.count;
      this.variablesService.currentWallet.totalPages = Math.ceil(
        total_history_item / count
      );
      this.variablesService.currentWallet.exclude_mining_txs = this.mining;
      this.variablesService.currentWallet.currentPage = 1;

      if (!this.variablesService.currentWallet.totalPages) {
        this.variablesService.currentWallet.totalPages = 1;
      }
      this.variablesService.currentWallet.totalPages >
      this.variablesService.maxPages
        ? (this.variablesService.currentWallet.pages = new Array(5)
            .fill(1)
            .map((value, index) => value + index))
        : (this.variablesService.currentWallet.pages = new Array(
            this.variablesService.currentWallet.totalPages
          )
            .fill(1)
            .map((value, index) => value + index));
    });
  }

  setPage(pageNumber: number): void {
    // this is will allow pagination for wallets that was open from existed wallets'
    if (pageNumber === this.variablesService.currentWallet.currentPage) {
      return;
    }
    if (
      this.variablesService.currentWallet.open_from_exist &&
      !this.variablesService.currentWallet.updated
    ) {
      this.variablesService.get_recent_transfers = false;
      this.variablesService.currentWallet.updated = true;
    }
    // if not running get_recent_transfers callback
    if (!this.variablesService.get_recent_transfers) {
      this.variablesService.currentWallet.currentPage = pageNumber;
    }
    if (!this.variablesService.get_recent_transfers) {
      this.getRecentTransfers();
    }
  }

  toggleMiningTransactions(): void {
    if (!this.variablesService.sync_started && !this.wallet) {
      const value = this.paginationStore.value;
      if (!value) {
        this.paginationStore.setPage(
          1,
          0,
          this.variablesService.currentWallet.wallet_id
        ); // add back page for the first page
      } else {
        const pages = value.filter(
          item =>
            item.walletID === this.variablesService.currentWallet.wallet_id
        );
        if (pages.length === 0) {
          this.paginationStore.setPage(
            1,
            0,
            this.variablesService.currentWallet.wallet_id
          ); // add back page for the first page
        }
      }
      this.mining = !this.mining;
      this.resetPaginationValues();
      this.getRecentTransfers();
    }
  }

  getRecentTransfers(): void {
    const offset = this.pagination.getOffset(
      this.variablesService.currentWallet.wallet_id
    );
    const value = this.paginationStore.value;
    const pages = value
      ? value.filter(
          item =>
            item.walletID === this.variablesService.currentWallet.wallet_id
        )
      : [];

    this.backend.getRecentTransfers(
      this.variablesService.currentWallet.wallet_id,
      offset,
      this.variablesService.count,
      this.variablesService.currentWallet.exclude_mining_txs,
      (status, data) => {
        const isForward = this.paginationStore.isForward(
          pages,
          this.variablesService.currentWallet.currentPage
        );
        if (this.mining && isForward && pages && pages.length === 1) {
          this.variablesService.currentWallet.currentPage = 1; // set init page after navigation back
        }

        const history = data && data.history;
        this.variablesService.stop_paginate[
          this.variablesService.currentWallet.wallet_id
        ] =
          (history && history.length < this.variablesService.count) || !history;
        this.stop_paginate =
          this.variablesService.stop_paginate[
            this.variablesService.currentWallet.wallet_id
          ];
        if (
          !this.variablesService.stop_paginate[
            this.variablesService.currentWallet.wallet_id
          ]
        ) {
          const page = this.variablesService.currentWallet.currentPage + 1;
          if (
            isForward &&
            this.mining &&
            history &&
            history.length === this.variablesService.count
          ) {
            this.paginationStore.setPage(
              page,
              data.last_item_index,
              this.variablesService.currentWallet.wallet_id
            ); // add back page for current page
          }
        }

        this.pagination.calcPages(data);
        this.pagination.prepareHistory(data, status);

        this.ngZone.run(() => {
          this.variablesService.get_recent_transfers = false;
          if (
            hasOwnProperty(
              this.variablesService.after_sync_request,
              String(this.variablesService.currentWallet.wallet_id)
            )
          ) {
            // this is will complete get_recent_transfers request
            // this will switch of
            this.variablesService.after_sync_request[
              this.variablesService.currentWallet.wallet_id
            ] = false;
          }
        });
      }
    );
  }

  tick(): void {
    const walletInterval = setInterval(() => {
      this.wallet = this.variablesService.getNotLoadedWallet();
      if (!this.wallet) {
        clearInterval(walletInterval);
      }
    }, 1000);
  }

  getHeight(item): number {
    if (
      (this.variablesService.height_app - item.height >= 10 &&
        item.height !== 0) ||
      (item.is_mining === true && item.height === 0)
    ) {
      return 10;
    } else {
      if (
        item.height === 0 ||
        this.variablesService.height_app - item.height < 0
      ) {
        return 0;
      } else {
        return this.variablesService.height_app - item.height;
      }
    }
  }

  openDetails(tx_hash): void {
    if (tx_hash === this.openedDetails) {
      this.openedDetails = '';
    } else {
      this.openedDetails = tx_hash;
    }
  }

  calculateWidth(): void {
    this.calculatedWidth = [];
    this.calculatedWidth.push(
      this.head.nativeElement.childNodes[0].clientWidth
    );
    this.calculatedWidth.push(
      this.head.nativeElement.childNodes[1].clientWidth +
        this.head.nativeElement.childNodes[2].clientWidth
    );
    this.calculatedWidth.push(
      this.head.nativeElement.childNodes[3].clientWidth
    );
    this.calculatedWidth.push(
      this.head.nativeElement.childNodes[4].clientWidth
    );
  }

  time(item: Transaction): number {
    const now = new Date().getTime();
    const unlockTime =
      now + (item.unlock_time - this.variablesService.height_max) * 60 * 1000;
    return unlockTime;
  }

  isLocked(item: Transaction): boolean {
    if (
      item.unlock_time > 500000000 &&
      item.unlock_time > new Date().getTime() / 1000
    ) {
      return true;
    }
    return (
      item.unlock_time < 500000000 &&
      item.unlock_time > this.variablesService.height_max
    );
  }
}
