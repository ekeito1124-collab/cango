import { Component } from 'react';

// 描画中のエラーで画面全体が真っ白にならないよう、共通のエラー画面を出す。
// 旅行者向け・事業者向け・運営向けで同じ形（再試行／戻る）にそろえる
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    const { labels, children } = this.props;
    if (!error) return children;
    return (
      <div className="error-screen" role="alert">
        <h1>{labels.title}</h1>
        <p>{labels.body}</p>
        <div className="row wrap">
          <button className="btn primary" onClick={() => this.setState({ error: null })}>
            {labels.retry}
          </button>
          <button
            className="btn"
            onClick={() => {
              this.setState({ error: null });
              window.history.length > 1 ? window.history.back() : window.location.assign('/');
            }}
          >
            {labels.back}
          </button>
        </div>
      </div>
    );
  }
}

export const JA_ERROR_LABELS = {
  title: '表示中に問題が起きました',
  body: '入力した内容は保存されている場合があります。もう一度お試しください。',
  retry: 'もう一度試す',
  back: '前の画面に戻る',
};
