import 'normalize.css/normalize.css';
import 'pickadate/lib/themes/classic.css';
import 'pickadate/lib/themes/classic.date.css';
import 'pickadate/lib/themes/classic.time.css';
import 'katex/dist/katex.min.css';

import 'vj/misc/float.styl';
import 'vj/misc/typography.styl';
import 'vj/misc/textalign.styl';
import 'vj/misc/grid.styl';
import 'vj/misc/slideout.styl';

import 'vj/misc/.iconfont/webicon.styl';
import 'vj/misc/immersive.styl';
import 'vj/misc/structure.styl';
import 'vj/misc/section.98.styl';
import 'vj/misc/nothing.styl';

import 'vj/components/editor/cmeditor.styl';
import 'vj/components/datepicker/datepicker.styl';
import 'vj/components/katex/katex.styl';

// load all page stylesheets
const pageStyleReq = require.context('../', true, /\.page\.styl$/i);
pageStyleReq.keys().map((key) => pageStyleReq(key));
const pageStyleReq98 = require.context('../', true, /\.page\.98\.styl$/i);
pageStyleReq98.keys().map((key) => pageStyleReq(key));

import './98.styl';
