import { Directive, ElementRef, Input, EventEmitter, Output, OnInit, AfterViewInit, Renderer2, NgZone, HostListener } from '@angular/core';

@Directive({
  selector: '[appResizable]',
})
export class ResizableDirective implements OnInit, AfterViewInit {
  @Input() public rDirections: string[] = []; // 'top' | 'bottom' | 'right' | 'left'
  @Input() public rFlex: boolean;
  @Input() public rCenteredX: boolean;
  @Input() public rCenteredY: boolean;
  @Input() public rDisabled: boolean;

  @Output() public onResize = new EventEmitter();

  private flexBasis: string;
  private style: CSSStyleDeclaration;
  private width: number;
  private height: number;
  private velocityX: number;
  private velocityY: number;
  private start: number;
  private dragDirection: string; // 'top' | 'bottom' | 'right' | 'left'
  private axis: 'x' | 'y';
  private info: any = {};

  private dragStart: (e: MouseEvent, direction: string) => void;
  private dragEnd: () => void;
  private dragging: (e: MouseEvent) => void;

  private beforeEl: ChildNode;
  private beforeElStyle: CSSStyleDeclaration;
  private beforeElHeight: number;
  private beforeElWidth: number;

  private afterEl: ChildNode;
  private afterElStyle: CSSStyleDeclaration;
  private afterElHeight: number;
  private afterElWidth: number;

  @HostListener ('window:resize', ['$event']) onWindowResize() {
    this.recalculateDraggersDimensions();
  }

  constructor(private el: ElementRef, private renderer: Renderer2, private zone: NgZone) {
    this.zone.runOutsideAngular(() => {
      this.initDragHandlers();
    });
  }

  ngOnInit() {
    this.flexBasis = this.getFlexBasis();
    this.renderer.addClass(this.el.nativeElement, 'resizable');

    // retreive siblings
    this.beforeEl = this.getBeforeElement();
    this.afterEl = this.getAfterElement();

    this.velocityX = this.rCenteredX ? 2 : 1; // if centered double velocity
    this.velocityY = this.rCenteredY ? 2 : 1; // if centered double velocity

    this.rDirections.forEach(direction => {
      const grabber: HTMLDivElement = this.renderer.createElement('div');

      // add class for styling purposes
      this.renderer.addClass(grabber, `rg-${direction}`);
      this.renderer.addClass(grabber, 'resizer');

      this.renderer.appendChild(grabber, this.renderer.createElement('span'));
      this.renderer.appendChild(this.el.nativeElement, grabber);

      grabber.ondragstart = () => { return false; };
      grabber.addEventListener('mousedown', (e) => {
        const disabled = this.rDisabled === true;
        if (!disabled && e.which === 1) {
          // left mouse click
          this.dragStart(e, direction);
        }
      }, false);
    });
  }

  ngAfterViewInit() {
    this.style = window.getComputedStyle(this.el.nativeElement, null);
    if (this.beforeEl) {
        this.beforeElStyle = window.getComputedStyle(this.beforeEl as HTMLElement, null);
    }
    if (this.afterEl) {
        this.afterElStyle = window.getComputedStyle(this.afterEl as HTMLElement, null);
    }
  }

  /**
   * Retreive element which is before current resizable element
   */
  private getBeforeElement(): ChildNode {
    let beforeElement: ChildNode = null;

    (this.el.nativeElement as HTMLElement).parentNode.childNodes.forEach(ch => {
      if (ch.nextSibling === this.el.nativeElement) {
          beforeElement = ch;
      }
    });

    return beforeElement;
  }

  /**
   * Retreive element which is after current resizable element
   */
  private getAfterElement(): ChildNode {
    return (this.el.nativeElement as HTMLElement).nextSibling;
  }

  /**
   * Get flex-basis property name for current browser
   */
  private getFlexBasis(): string {
    return 'flexBasis' in document.documentElement.style ? 'flexBasis' :
      'webkitFlexBasis' in document.documentElement.style ? 'webkitFlexBasis' :
        'msFlexPreferredSize' in document.documentElement.style ? 'msFlexPreferredSize' : 'flexBasis';
  }

  private initDragHandlers() {
    const dragStartFn = (e: MouseEvent, direction: string) => {
      console.log('dragStart', e, direction);
      this.dragDirection = direction;
      this.axis = this.dragDirection === 'left' || this.dragDirection === 'right' ? 'x' : 'y';
      this.start = this.axis === 'x' ? e.clientX : e.clientY;


      this.width = parseInt(this.style.getPropertyValue('width'));
      this.height = parseInt(this.style.getPropertyValue('height'));

      if (this.beforeEl) {
        this.beforeElWidth = parseInt(this.beforeElStyle.getPropertyValue('width'));
        this.beforeElHeight = parseInt(this.beforeElStyle.getPropertyValue('height'));
      }
      if (this.afterEl) {
        this.afterElWidth = parseInt(this.afterElStyle.getPropertyValue('width'));
        this.afterElHeight = parseInt(this.afterElStyle.getPropertyValue('height'));
      }

      //prevent transition while dragging
      this.renderer.addClass(this.el.nativeElement, 'no-transition');

      document.addEventListener('mouseup', this.dragEnd, false);
      document.addEventListener('mousemove', this.dragging, false);

      // Disable highlighting while dragging
      e.stopPropagation && e.stopPropagation();
      e.preventDefault && e.preventDefault();
      e.cancelBubble = true;
      e.returnValue = false;

      this.updateInfo(e);
      this.onResize.emit(this.info);
    };

    const dragEndFn = () => {
      console.log('dragEnd');
      this.updateInfo(null);

      this.onResize.emit(this.info);

      document.removeEventListener('mouseup', this.dragEnd, false);
      document.removeEventListener('mousemove', this.dragging, false);
      this.renderer.removeClass(this.el.nativeElement, 'no-transition');
    };

    /**
     * This fucntion handles resing of current element and elements before/after
     * For example when we resize some element on y axis increasing it's height,
     * we need to decrease height of previous sibling for the same offset
     */
    const draggingFn = (e: MouseEvent) => {
      let prop: string;
      let offset = this.axis === 'x' ? this.start - e.clientX : this.start - e.clientY;
      switch(this.dragDirection) {
        case 'top': {
          prop = this.rFlex ? this.flexBasis : 'height';
          this.renderer.setStyle(this.el.nativeElement, prop, `${this.height + (offset * this.velocityY)}px`);
          this.renderer.setStyle(this.beforeEl, prop, `${this.beforeElHeight - (offset * this.velocityY)}px`);
          break;
        }
        case 'bottom': {
          prop = this.rFlex ? this.flexBasis : 'height';
          this.renderer.setStyle(this.el.nativeElement, prop, `${this.height - (offset * this.velocityY)}px`);
          this.renderer.setStyle(this.afterEl, prop, `${this.afterElHeight + (offset * this.velocityY)}px`);
          break;
        }
        case 'right': {
          prop = this.rFlex ? this.flexBasis : 'width';
          this.renderer.setStyle(this.el.nativeElement, prop, `${this.width - (offset * this.velocityX)}px`);
          this.renderer.setStyle(this.afterEl, prop, `${this.afterElWidth + (offset * this.velocityX)}px`);
          break;
        }
        case 'left': {
          prop = this.rFlex ? this.flexBasis : 'width';
          this.renderer.setStyle(this.el.nativeElement, prop, `${this.width + (offset * this.velocityX)}px`);
          this.renderer.setStyle(this.beforeEl, prop, `${this.beforeElWidth - (offset * this.velocityX)}px`);
          break;
        }
      }

      this.renderer.setStyle((this.el.nativeElement as HTMLElement).parentElement, 'align-items', 'stretch');


      this.recalculateDraggersDimensions();

      this.updateInfo(e);

      this.zone.runOutsideAngular(() => {
        this.onResize.emit(this.info);
      });
    };

    this.dragStart = dragStartFn.bind(this);
    this.dragEnd = dragEndFn.bind(this);
    this.dragging = draggingFn.bind(this);
  }

  /**
   * Used for recalculatung separators of all resizable elements width
   * cause for some purposes after resizing some separators doesn't take all parent's width/height
   */
  private recalculateDraggersDimensions() {
    document.querySelectorAll('.resizer').forEach(r => {
      if (r.classList.contains('rg-right') || r.classList.contains('rg-left')) {
          this.renderer.setStyle(r, 'height', `${r.parentElement.scrollHeight}px`);
      }
      if (r.classList.contains('rg-top') || r.classList.contains('rg-bottom')) {
          this.renderer.setStyle(r, 'width', `${r.parentElement.clientWidth}px`);
      }
    });
  }

  private updateInfo(e: Event) {
    this.info.width = false;
    this.info.height = false;

    if (this.axis === 'x') {
      this.info.width = parseInt((this.el.nativeElement as HTMLElement).style[this.rFlex ? this.flexBasis : 'width']);
    } else {
      this.info.height = parseInt((this.el.nativeElement as HTMLElement).style[this.rFlex ? this.flexBasis : 'height']);
    }

    this.info.id = (this.el.nativeElement as HTMLElement).id
    this.info.event = e;
  }
}
